"""Regex tokenizer for BM25 that copes with English, French and Dutch.

The policies are in English but employees in Brussels and Liège ask in French or Dutch,
so the tokenizer removes the differences that are only about spelling:
accents ("télétravail"), apostrophes ("l'alcool"), number formats ("2,500" / "2.500" / "4 000")
and the euro sign. It cannot translate words: that is what the multilingual dense model is for.
"""

import re
import unicodedata

# Thousands separators: "2,500" (EN), "2.500" (NL), "4 000" / "4 000" (FR) -> "2500" / "4000"
THOUSANDS = re.compile(r"(?<=\d)[,.\s  ](?=\d{3}\b)")
ELISION = re.compile(r"\b(?:l|d|j|m|n|s|t|c|qu)['’]", re.IGNORECASE)  # l'alcool -> alcool
EURO = re.compile(r"€|\beuros?\b|\beur\b", re.IGNORECASE)
TOKEN = re.compile(r"[a-z0-9]+")

STOPWORDS = set(
    # English
    "a an and are as at be by can do does for from has have how i if in is it its may me must my no not "
    "of on or our should so than that the their there this to up was we what when where which who will "
    "with you your am any"
    # French
    " au aux avec ce ces dans de des du elle en est et il ils je la le les leur mais mes mon ne nous "
    "on ou par pas pour qu que qui sa se ses son sont sur ta te tes ton tu un une vos votre vous y "
    "ai as a-t-il quel quelle quels quelles quand comment combien puis-je dois-je faut-il est-il"
    # Dutch
    " aan al bij dat de die dit een en er het hoe ik in is je mag me met mijn moet na naar niet nog "
    "of om op te tot u uw van voor wat wanneer waar wie wij ze zijn heb hebben krijg ben"
    .split()
)


def fold(text: str) -> str:
    """Lower-case and remove accents."""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def stem(token: str) -> str:
    """Very light plural stripping, safe for EN/FR/NL ('quotes' -> 'quote', 'policies' -> 'policy')."""
    if token.isdigit() or len(token) <= 4:
        return token
    if token.endswith("ies"):
        return token[:-3] + "y"
    if token.endswith(("ss", "us")):
        return token
    if token.endswith(("s", "x")):
        return token[:-1]
    return token


def tokenize(text: str) -> list[str]:
    text = THOUSANDS.sub("", text)
    text = ELISION.sub("", text)
    text = EURO.sub(" eur ", text)
    return [stem(t) for t in TOKEN.findall(fold(text)) if t not in STOPWORDS]
