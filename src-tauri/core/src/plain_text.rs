//! Markdown export consumes parser events; it never rewrites the document source.
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};

fn separation(output: &mut String, lines: usize) {
    if output.is_empty() { return; }
    let present = output.chars().rev().take_while(|c| *c == '\n').count();
    for _ in present..lines { output.push('\n'); }
}

// Raw HTML is treated only as text. No browser, DOM, or script is invoked.
fn html_text(html: &str, output: &mut String) {
    let mut inside = false;
    let mut quote = None;
    let mut tag = String::new();
    for ch in html.chars() {
        if !inside {
            if ch == '<' { inside = true; tag.clear(); } else { output.push(ch); }
        } else if let Some(q) = quote {
            if ch == q { quote = None; }
        } else if ch == '"' || ch == '\'' { quote = Some(ch); }
        else if ch == '>' {
            let name = tag.trim().trim_start_matches('/').split_whitespace().next().unwrap_or("").trim_end_matches('/').to_ascii_lowercase();
            if matches!(name.as_str(), "br" | "p" | "div" | "li" | "tr" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6") { separation(output, 1); }
            inside = false;
        } else { tag.push(ch); }
    }
}

pub fn markdown_to_text(source: &str) -> String {
    let options = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS | Options::ENABLE_FOOTNOTES;
    let mut output = String::with_capacity(source.len());
    let mut lists: Vec<Option<u64>> = Vec::new();
    let mut cells = 0;
    let mut item_marker = false;
    for event in Parser::new_ext(source, options) {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => { if !item_marker { separation(&mut output, 2); } }
                Tag::Heading { .. } | Tag::BlockQuote(_) | Tag::CodeBlock(_) | Tag::Table(_) => { if !item_marker { separation(&mut output, if lists.is_empty() { 2 } else { 1 }); } }
                Tag::List(start) => { separation(&mut output, 1); lists.push(start); }
                Tag::Item => {
                    separation(&mut output, 1);
                    for _ in 1..lists.len() { output.push_str("  "); }
                    if let Some(Some(number)) = lists.last_mut() { output.push_str(&format!("{number}. ")); *number = number.saturating_add(1); }
                    else { output.push_str("- "); }
                    item_marker = true;
                }
                Tag::TableHead | Tag::TableRow => { separation(&mut output, 1); cells = 0; }
                Tag::TableCell => { if cells > 0 { output.push('\t'); } cells += 1; }
                Tag::FootnoteDefinition(label) => { separation(&mut output, 2); output.push_str(&format!("[{label}] ")); }
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Paragraph => separation(&mut output, 2),
                TagEnd::Heading(_) | TagEnd::BlockQuote(_) | TagEnd::CodeBlock | TagEnd::Table | TagEnd::FootnoteDefinition => separation(&mut output, if lists.is_empty() { 2 } else { 1 }),
                TagEnd::List(_) => { lists.pop(); separation(&mut output, if lists.is_empty() { 2 } else { 1 }); }
                TagEnd::Item | TagEnd::TableHead | TagEnd::TableRow => separation(&mut output, 1),
                _ => {}
            },
            Event::Text(text) | Event::Code(text) | Event::InlineMath(text) | Event::DisplayMath(text) => { output.push_str(&text); item_marker = false; }
            Event::SoftBreak | Event::HardBreak => output.push('\n'),
            Event::Rule => separation(&mut output, 2),
            Event::TaskListMarker(done) => output.push_str(if done { "[x] " } else { "[ ] " }),
            Event::FootnoteReference(label) => output.push_str(&format!("[{label}]")),
            Event::Html(html) | Event::InlineHtml(html) => html_text(&html, &mut output),
        }
    }
    let length = output.trim_end_matches('\n').len();
    output.truncate(length);
    if !output.is_empty() { output.push('\n'); }
    output
}
