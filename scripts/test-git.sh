#!/usr/bin/env bash
# Roda os testes do núcleo com uma versão específica do git, num container Linux (igual ao CI).
# Uso: scripts/test-git.sh 2.56.0 [2.43.0 ...]  (as versões rodam em paralelo)
set -euo pipefail
cd "$(dirname "$0")/.."
run() { v=$1

  MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD":/src:ro -v mnemo-git-cache:/cache -w /work rust:latest bash -c '
    set -euo pipefail
    V='"$v"'
    if [ ! -x /cache/git-$V/bin/git ]; then
      echo "[git $V] baixando e compilando (só na 1ª vez)"; cd /tmp && curl -fsSL https://mirrors.edge.kernel.org/pub/software/scm/git/git-$V.tar.gz | tar xz
      make -C git-$V -j"$(nproc)" prefix=/cache/git-$V NO_OPENSSL=1 NO_CURL=1 NO_GETTEXT=1 NO_TCLTK=1 NO_PERL=1 NO_EXPAT=1 NO_PYTHON=1 install 2>&1 | grep -E "^(  (CC|LINK|GEN)|make)" | awk "NR%200==0{print \"[git $V] compilando... \" NR \" passos\"}"
    fi
    export PATH=/cache/git-$V/bin:$PATH CARGO_TARGET_DIR=/cache/target-$V CARGO_HOME=/cache/cargo
    echo "[git $V] pronto: $(git --version)"
    test "$(git --version)" = "git version $V"
    mkdir -p /work && cp -r /src/. /work/ && rm -rf /work/target /work/app/node_modules
    echo "[git $V] cargo test"; cd /work; cargo test -p mnemo-core 2>&1'
}
pids=()
for v in "$@"; do ( run "$v" 2>&1 | sed -u "s/^/[$v] /" ) & pids+=($!); done
rc=0; for p in "${pids[@]}"; do wait "$p" || rc=1; done; exit $rc
