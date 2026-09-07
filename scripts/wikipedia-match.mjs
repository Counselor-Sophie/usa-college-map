// Conservative matching for Wikipedia search results. Explicit OSM wikipedia and
// wikidata tags bypass this heuristic because those references are authoritative.

const PLACE_WORDS = /\b(building|tower|hall|library|centre|center|stadium|union|church|cathedral|chapel|museum|garden|pavilion|wing|annex|dormitory|residence|hospital|arena|auditorium|theatre|theater|campus|quadrangle|quad|laboratory|observatory|gymnasium|complex|institute|gallery|lab|mall|structure|facility|bridge|statue|memorial|monument|park|plaza|school|academy)\b/i;

const NON_PLACE_DESCRIPTORS = /\b(politician|businessman|businesswoman|entrepreneur|philanthropist|artist|painter|sculptor|author|writer|novelist|journalist|director|architect|professor|scientist|physicist|mathematician|chemist|biologist|economist|musician|singer|actor|actress|judge|lawyer|philosopher|theologian|athlete|football|basketball|baseball|tennis|boxer|olympian|coach|cardinal|horse|farm|ranch|film|movie|novel|song|album|character|species|ship|aircraft|vehicle|company|corporation|organization|foundation|fraternity|sorority|band|team|faction)\b/i;

const GENERIC_COLLEGE_WORDS = new Set([
  'university', 'college', 'institute', 'school', 'the', 'of', 'at',
]);
const ACRONYM_STOP_WORDS = new Set(['the', 'of', 'at']);

const GENERIC_BUILDING_WORDS = new Set([
  'academy', 'annex', 'arena', 'auditorium', 'building', 'campus',
  'cathedral', 'center', 'centre', 'chapel', 'church', 'complex',
  'dormitory', 'facility', 'gallery', 'garden', 'gymnasium', 'hall',
  'hospital', 'house', 'institute', 'laboratory', 'library', 'mall',
  'memorial', 'museum', 'observatory', 'park', 'pavilion', 'plaza',
  'quadrangle', 'residence', 'school', 'stadium', 'structure', 'theater',
  'theatre', 'tower', 'union', 'wing',
]);

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('en-US')
    .replace(/[_\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesPhrase(text, phrase) {
  return phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);
}

// Is this search result about a specific building on this college's campus?
export function isRelevantMatch(summary, buildingName, collegeName) {
  const title = normalize(summary.title);
  const extract = normalize(summary.extract);
  const description = normalize(summary.description);
  const normalizedBuilding = normalize(buildingName);
  const normalizedCollege = normalize(collegeName);

  if (NON_PLACE_DESCRIPTORS.test(description)) return false;
  if (title === normalizedCollege) return false;

  const looksLikePlace =
    PLACE_WORDS.test(title) ||
    PLACE_WORDS.test(description) ||
    /\b(is a building|is an academic|was built|was completed|was constructed|was designed|is located on|is housed in|is the main|opened in)\b/i.test(extract.slice(0, 400));
  if (!looksLikePlace) return false;

  const articleText = `${title} ${description} ${extract}`;
  const articleWords = new Set(articleText.split(' ').filter(Boolean));
  const collegeTokens = normalizedCollege
    .split(' ')
    .filter((word) => word.length > 2 && !GENERIC_COLLEGE_WORDS.has(word));
  const collegeInitials = normalizedCollege
    .split(' ')
    .filter((word) => word.length > 0 && !ACRONYM_STOP_WORDS.has(word))
    .map((word) => word[0])
    .join('');
  const collegeMentioned =
    includesPhrase(articleText, normalizedCollege) ||
    (collegeTokens.length >= 2 && collegeTokens.every((word) => articleWords.has(word))) ||
    (collegeInitials.length >= 3 && articleWords.has(collegeInitials));
  if (!collegeMentioned) return false;

  const titleWords = new Set(title.split(' ').filter(Boolean));
  const distinctiveBuildingTokens = normalizedBuilding
    .split(' ')
    .filter((word) => word.length > 3 && !GENERIC_BUILDING_WORDS.has(word));
  const exactBuildingMention =
    includesPhrase(title, normalizedBuilding) ||
    includesPhrase(extract, normalizedBuilding);
  const titleHasDistinctiveToken = distinctiveBuildingTokens.some((word) =>
    titleWords.has(word)
  );

  return exactBuildingMention || titleHasDistinctiveToken;
}
