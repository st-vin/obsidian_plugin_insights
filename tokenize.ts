const STOP_WORDS = new Set<string>([
	'a','an','and','are','as','at','be','but','by','for','if','in','into','is','it','no','not','of','on','or','such','that','the','their','then','there','these','they','this','to','was','will','with','from','we','you','your','i','our','ours','yours','me','my','mine','he','she','his','her','hers','them','those','were','been','being','about','over','under','again','further','do','does','did','doing','so','than','too','very','can','could','should','would','may','might'
]);

export function stripMarkdown(input: string): string {
	let text = input;
	// Remove code blocks
	text = text.replace(/```[\s\S]*?```/g, ' ');
	// Remove inline code
	text = text.replace(/`[^`]*`/g, ' ');
	// Images ![alt](url)
	text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
	// Links [text](url) -> text
	text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
	// Headings, lists, blockquotes markers
	text = text.replace(/^[#>\-+*]+\s+/gm, '');
	// HTML tags
	text = text.replace(/<[^>]+>/g, ' ');
	// YAML frontmatter
	text = text.replace(/^---[\s\S]*?---/m, ' ');
	// Collapse whitespace
	text = text.replace(/[\t\r]+/g, ' ');
	return text;
}

export function lemmatizeToken(token: string): string {
	// light rules: plural, past, gerund
	if (token.endsWith('ies') && token.length > 4) {
		return token.slice(0, -3) + 'y';
	}
	if (token.endsWith('sses')) {
		return token.slice(0, -2); // e.g., classes -> class
	}
	if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) {
		return token.slice(0, -1);
	}
	if (token.endsWith('ing') && token.length > 5) {
		return token.slice(0, -3);
	}
	if (token.endsWith('ed') && token.length > 4) {
		return token.slice(0, -2);
	}
	return token;
}

export function tokenize(text: string): string[] {
	const stripped = stripMarkdown(text.toLowerCase());
	const rough = stripped.split(/[^a-z0-9]+/g);
	const tokens: string[] = [];
	for (const raw of rough) {
		if (!raw) continue;
		if (STOP_WORDS.has(raw)) continue;
		const lemma = lemmatizeToken(raw);
		if (lemma && !STOP_WORDS.has(lemma)) tokens.push(lemma);
	}
	return tokens;
}