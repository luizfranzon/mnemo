//! Codificações do diff: lista oferecida à UI, decodificação de bytes e detecção ("Adivinhar").
use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::Encoding;
use oem_cp::code_table as cp;
use serde::Serialize;

pub const GUESS: &str = "guess";
pub const BINARY: &str = "binary";

#[derive(Clone, Copy, Debug, Serialize)]
pub struct EncodingInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub group: &'static str,
}

const fn e(group: &'static str, id: &'static str, label: &'static str) -> EncodingInfo {
    EncodingInfo { id, label, group }
}

/// Ordem de exibição; `guess` e `binary` ficam no topo, fora de grupo. Os ids do `encoding_rs` são os próprios nomes dele em minúsculas.
pub const LIST: &[EncodingInfo] = &[
    e("", GUESS, "Adivinhar codificação"),
    e("", BINARY, "Binário"),
    e("Unicode", "utf-8", "UTF-8"),
    e("Unicode", "utf-8-bom", "UTF-8 BOM"),
    e("Unicode", "utf-16", "UTF-16 (BOM)"),
    e("Unicode", "utf-16le", "UTF-16LE"),
    e("Unicode", "utf-16be", "UTF-16BE"),
    e("Unicode", "utf-32", "UTF-32 (BOM)"),
    e("Unicode", "utf-32le", "UTF-32LE"),
    e("Unicode", "utf-32be", "UTF-32BE"),
    e("Windows", "windows-1250", "Windows-1250 (Europa Central)"),
    e("Windows", "windows-1251", "Windows-1251 (Cirílico)"),
    e("Windows", "windows-1252", "Windows-1252 (Europa Ocidental)"),
    e("Windows", "windows-1253", "Windows-1253 (Grego)"),
    e("Windows", "windows-1254", "Windows-1254 (Turco)"),
    e("Windows", "windows-1255", "Windows-1255 (Hebraico)"),
    e("Windows", "windows-1256", "Windows-1256 (Árabe)"),
    e("Windows", "windows-1257", "Windows-1257 (Báltico)"),
    e("Windows", "windows-1258", "Windows-1258 (Vietnamita)"),
    e("Windows", "windows-874", "Windows-874 (Tailandês)"),
    e("ISO-8859", "iso-8859-1", "ISO-8859-1 (Latin-1)"),
    e("ISO-8859", "iso-8859-2", "ISO-8859-2 (Latin-2)"),
    e("ISO-8859", "iso-8859-3", "ISO-8859-3 (Latin-3)"),
    e("ISO-8859", "iso-8859-4", "ISO-8859-4 (Latin-4)"),
    e("ISO-8859", "iso-8859-5", "ISO-8859-5 (Cirílico)"),
    e("ISO-8859", "iso-8859-6", "ISO-8859-6 (Árabe)"),
    e("ISO-8859", "iso-8859-7", "ISO-8859-7 (Grego)"),
    e("ISO-8859", "iso-8859-8", "ISO-8859-8 (Hebraico)"),
    e("ISO-8859", "iso-8859-10", "ISO-8859-10 (Latin-6)"),
    e("ISO-8859", "iso-8859-13", "ISO-8859-13 (Latin-7)"),
    e("ISO-8859", "iso-8859-14", "ISO-8859-14 (Latin-8)"),
    e("ISO-8859", "iso-8859-15", "ISO-8859-15 (Latin-9)"),
    e("ISO-8859", "iso-8859-16", "ISO-8859-16 (Latin-10)"),
    e("DOS (CP)", "cp437", "CP437 (EUA)"),
    e("DOS (CP)", "cp720", "CP720 (Árabe)"),
    e("DOS (CP)", "cp737", "CP737 (Grego)"),
    e("DOS (CP)", "cp775", "CP775 (Báltico)"),
    e("DOS (CP)", "cp850", "CP850 (Europa Ocidental)"),
    e("DOS (CP)", "cp852", "CP852 (Europa Central)"),
    e("DOS (CP)", "cp855", "CP855 (Cirílico)"),
    e("DOS (CP)", "cp857", "CP857 (Turco)"),
    e("DOS (CP)", "cp858", "CP858 (Europa Ocidental, €)"),
    e("DOS (CP)", "cp860", "CP860 (Português)"),
    e("DOS (CP)", "cp861", "CP861 (Islandês)"),
    e("DOS (CP)", "cp862", "CP862 (Hebraico)"),
    e("DOS (CP)", "cp863", "CP863 (Francês canadense)"),
    e("DOS (CP)", "cp864", "CP864 (Árabe)"),
    e("DOS (CP)", "cp865", "CP865 (Nórdico)"),
    e("DOS (CP)", "ibm866", "CP866 (Cirílico)"),
    e("DOS (CP)", "cp869", "CP869 (Grego)"),
    e("Mac", "macintosh", "Mac Roman"),
    e("Mac", "x-mac-cyrillic", "Mac Cyrillic"),
    e("KOI8", "koi8-r", "KOI8-R"),
    e("KOI8", "koi8-u", "KOI8-U"),
    e("Asiáticas", "gbk", "GBK"),
    e("Asiáticas", "gb18030", "GB18030"),
    e("Asiáticas", "big5", "Big5"),
    e("Asiáticas", "shift_jis", "Shift_JIS"),
    e("Asiáticas", "euc-jp", "EUC-JP"),
    e("Asiáticas", "iso-2022-jp", "ISO-2022-JP"),
    e("Asiáticas", "euc-kr", "EUC-KR"),
];

pub fn label(id: &str) -> &str {
    LIST.iter().find(|i| i.id == id).map_or(id, |i| i.label)
}

pub fn is_known(id: &str) -> bool {
    LIST.iter().any(|i| i.id == id)
}

/// UTF-16/32 têm bytes `00` e `\n` de 2 ou 4 bytes: o git os trata como binário e o diff precisa de texto convertido.
pub fn is_wide(id: &str) -> bool {
    id.starts_with("utf-16") || id.starts_with("utf-32")
}

/// Codificação larga indicada por BOM no começo do arquivo.
pub fn wide_bom(bytes: &[u8]) -> Option<&'static str> {
    match bytes {
        [0xFF, 0xFE, 0, 0, ..] => Some("utf-32le"),
        [0, 0, 0xFE, 0xFF, ..] => Some("utf-32be"),
        [0xFF, 0xFE, ..] => Some("utf-16le"),
        [0xFE, 0xFF, ..] => Some("utf-16be"),
        _ => None,
    }
}

/// Decodifica sem nunca falhar: o que não mapeia vira `�`. O BOM inicial some do texto.
pub fn decode(id: &str, bytes: &[u8]) -> String {
    let text = match id {
        "utf-16" | "utf-32" => {
            let wide = wide_bom(bytes).filter(|w| w.starts_with(id)).unwrap_or(if id == "utf-16" {
                "utf-16le"
            } else {
                "utf-32le"
            });
            return decode(wide, bytes);
        }
        "utf-32le" => utf32(bytes, u32::from_le_bytes),
        "utf-32be" => utf32(bytes, u32::from_be_bytes),
        "iso-8859-1" => bytes.iter().map(|&b| b as char).collect(),
        "utf-8-bom" => String::from_utf8_lossy(bytes).into_owned(),
        "cp437" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP437),
        "cp720" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP720),
        "cp737" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP737),
        "cp775" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP775),
        "cp850" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP850),
        "cp852" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP852),
        "cp855" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP855),
        "cp857" => oem_cp::decode_string_incomplete_table_lossy(bytes, &cp::DECODING_TABLE_CP857),
        "cp858" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP858),
        "cp860" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP860),
        "cp861" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP861),
        "cp862" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP862),
        "cp863" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP863),
        "cp864" => oem_cp::decode_string_incomplete_table_lossy(bytes, &cp::DECODING_TABLE_CP864),
        "cp865" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP865),
        "cp869" => oem_cp::decode_string_complete_table(bytes, &cp::DECODING_TABLE_CP869),
        other => match Encoding::for_label(other.as_bytes()) {
            Some(enc) => enc.decode_without_bom_handling(bytes).0.into_owned(),
            None => String::from_utf8_lossy(bytes).into_owned(),
        },
    };
    text.strip_prefix('\u{FEFF}').map(str::to_string).unwrap_or(text)
}

fn utf32(bytes: &[u8], word: fn([u8; 4]) -> u32) -> String {
    bytes.chunks_exact(4).map(|c| char::from_u32(word([c[0], c[1], c[2], c[3]])).unwrap_or('\u{FFFD}')).collect()
}

/// Escolhe a codificação de um trecho de bytes sem BOM largo: UTF-8 válido fica UTF-8 (sem rodar o detector),
/// senão o `chardetng` decide. O segundo valor diz se o detector foi usado.
pub fn guess(bytes: &[u8]) -> (&'static str, bool) {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return ("utf-8-bom", false);
    }
    if std::str::from_utf8(bytes).is_ok() {
        return ("utf-8", false);
    }
    let mut detector = EncodingDetector::new(Iso2022JpDetection::Allow);
    detector.feed(bytes, true);
    let name = detector.guess(None, Utf8Detection::Deny).name().to_ascii_lowercase();
    let id = LIST.iter().find(|i| i.id == name).map_or("windows-1252", |i| i.id);
    (id, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn todo_id_da_lista_decodifica_ascii() {
        for info in LIST.iter().filter(|i| i.group != "") {
            let wide = info.id.starts_with("utf-16") || info.id.starts_with("utf-32");
            if wide || info.id == "iso-2022-jp" {
                continue;
            }
            assert_eq!(decode(info.id, b"abc"), "abc", "{}", info.id);
        }
    }

    #[test]
    fn decodifica_single_byte_e_dos() {
        assert_eq!(decode("windows-1252", &[0xE7, 0xE3]), "çã");
        assert_eq!(decode("iso-8859-1", &[0xE9]), "é");
        assert_eq!(decode("cp850", &[0x87, 0xC6]), "çã");
        assert_eq!(decode("macintosh", &[0x8D]), "ç");
        assert_eq!(decode("koi8-r", &[0xC1]), "а");
    }

    #[test]
    fn decodifica_utf16_e_utf32_e_tira_o_bom() {
        assert_eq!(decode("utf-16", &[0xFF, 0xFE, b'a', 0, 0xE9, 0]), "aé");
        assert_eq!(decode("utf-16", &[0xFE, 0xFF, 0, b'a']), "a");
        assert_eq!(decode("utf-32le", &[b'a', 0, 0, 0, 0xE9, 0, 0, 0]), "aé");
        assert_eq!(decode("utf-32be", &[0, 0, 0, b'a']), "a");
        assert_eq!(decode("utf-8-bom", &[0xEF, 0xBB, 0xBF, b'a']), "a");
    }

    #[test]
    fn adivinha_so_roda_o_detector_fora_do_utf8() {
        assert_eq!(guess("ação".as_bytes()), ("utf-8", false));
        assert_eq!(guess(&[0xEF, 0xBB, 0xBF, b'a']), ("utf-8-bom", false));
        let (id, guessed) = guess(&[b'a', b'c', 0xE7, 0xE3, b'o', b' ', b'd', b'e', b' ', b'n', 0xE3, b'o']);
        assert!(guessed);
        assert!(is_known(id));
        assert_eq!(wide_bom(&[0xFF, 0xFE, 0, 0]), Some("utf-32le"));
        assert_eq!(wide_bom(&[0xFF, 0xFE, b'a', 0]), Some("utf-16le"));
    }
}
