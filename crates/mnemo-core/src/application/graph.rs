//! Layout incremental do grafo. O cursor guarda só as lanes abertas, não o histórico inteiro.
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

pub const COLORS: [&str; 8] = ["#4fb3d9", "#d65bd0", "#e5534b", "#e0a43a", "#5b8def", "#46b866", "#c4a7f5", "#f08a5d"];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveLane {
    pub sha: String,
    pub color: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphCursor {
    pub offset: usize,
    pub lanes: Vec<Option<ActiveLane>>,
    pub next_color: usize,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SegmentKind {
    Pass,
    Incoming,
    Parent,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphSegment {
    pub from_lane: usize,
    pub to_lane: usize,
    pub color: String,
    pub kind: SegmentKind,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRef {
    pub name: String,
    pub kind: String,
    pub current: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphCommit {
    pub sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub subject: String,
    /// Primeira linha não vazia do corpo da mensagem.
    pub description: String,
    pub lane: usize,
    pub color: String,
    pub lane_count: usize,
    pub segments: Vec<GraphSegment>,
    pub refs: Vec<GraphRef>,
    pub head: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WipSummary {
    pub changed: usize,
    pub untracked: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphPage {
    pub commits: Vec<GraphCommit>,
    pub next: Option<GraphCursor>,
    pub wip: WipSummary,
}

/// O que o grafo mostra. Os nomes são refs completas (`refs/heads/x`, `refs/remotes/origin/x`).
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GraphVisibility {
    pub hidden: Vec<String>,
    pub solo: Option<String>,
    /// Só a branch atual, a base e o que já foi mergeado nelas.
    pub smart: bool,
}

impl GraphVisibility {
    pub fn shows(&self, refname: &str, smart_set: &HashSet<String>) -> bool {
        self.solo.as_deref().map_or(true, |solo| solo == refname)
            && !self.hidden.iter().any(|hidden| hidden == refname)
            && (!self.smart || smart_set.contains(refname))
    }
}

pub struct CommitInput {
    pub sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub subject: String,
    pub description: String,
}

impl GraphCursor {
    /// Avança exatamente um commit em ordem topológica. Lanes já emitidas nunca mudam.
    pub fn layout(&mut self, input: CommitInput, refs: Vec<GraphRef>, head_sha: Option<&str>) -> GraphCommit {
        let old_count = self.lanes.len();
        let matching: Vec<usize> = self
            .lanes
            .iter()
            .enumerate()
            .filter_map(|(i, lane)| lane.as_ref().filter(|lane| lane.sha == input.sha).map(|_| i))
            .collect();
        let lane = matching.first().copied().unwrap_or_else(|| self.free_lane());
        let color_index = if let Some(active) = self.lanes.get(lane).and_then(Option::as_ref) {
            active.color
        } else {
            let color = self.next_color;
            self.next_color += 1;
            color
        };
        let color = COLORS[color_index % COLORS.len()].to_string();
        let mut segments = Vec::new();
        for (i, active) in self.lanes.iter().enumerate() {
            let Some(active) = active else { continue };
            if matching.contains(&i) {
                segments.push(GraphSegment {
                    from_lane: i,
                    to_lane: lane,
                    color: COLORS[active.color % COLORS.len()].into(),
                    kind: SegmentKind::Incoming,
                });
            } else {
                segments.push(GraphSegment {
                    from_lane: i,
                    to_lane: i,
                    color: COLORS[active.color % COLORS.len()].into(),
                    kind: SegmentKind::Pass,
                });
            }
        }
        for i in matching {
            self.lanes[i] = None;
        }
        for (parent_index, parent) in input.parents.iter().enumerate() {
            let target = self
                .lanes
                .iter()
                .position(|item| item.as_ref().is_some_and(|item| item.sha == *parent))
                .unwrap_or_else(|| {
                    let slot = if parent_index == 0 && self.lanes.get(lane).is_some_and(Option::is_none) {
                        lane
                    } else {
                        self.free_lane()
                    };
                    let parent_color = if parent_index == 0 {
                        color_index
                    } else {
                        let c = self.next_color;
                        self.next_color += 1;
                        c
                    };
                    if slot == self.lanes.len() {
                        self.lanes.push(None);
                    }
                    self.lanes[slot] = Some(ActiveLane { sha: parent.clone(), color: parent_color });
                    slot
                });
            let edge_color = self.lanes[target].as_ref().map(|a| COLORS[a.color % COLORS.len()]).unwrap_or(&color);
            segments.push(GraphSegment {
                from_lane: lane,
                to_lane: target,
                color: edge_color.into(),
                kind: SegmentKind::Parent,
            });
        }
        while self.lanes.last().is_some_and(Option::is_none) {
            self.lanes.pop();
        }
        self.offset += 1;
        let lane_count = old_count.max(self.lanes.len()).max(lane + 1);
        GraphCommit {
            sha: input.sha.clone(),
            parents: input.parents,
            author: input.author,
            email: input.email,
            timestamp: input.timestamp,
            subject: input.subject,
            description: input.description,
            lane,
            color,
            lane_count,
            segments,
            refs,
            head: head_sha == Some(input.sha.as_str()),
        }
    }

    fn free_lane(&self) -> usize {
        self.lanes.iter().position(Option::is_none).unwrap_or(self.lanes.len())
    }
}

pub fn refs_by_sha(entries: impl IntoIterator<Item = (String, GraphRef)>) -> HashMap<String, Vec<GraphRef>> {
    let mut map: HashMap<String, Vec<GraphRef>> = HashMap::new();
    for (sha, reference) in entries {
        map.entry(sha).or_default().push(reference);
    }
    map
}
