# Writing rules

Last Updated: {{DATE}}

Standard for every text the framework produces. Profile derived from ASD-STE100
(*Simplified Technical English*). Agents read this file before they write.
The `npx @s2bp/ai-led-framework lint` command checks the measurable rules.

## Scope

The standard applies to every text an agent or a skill produces:

- the `memory/*.md` files;
- tickets, acceptance criteria, SPECs and ADRs;
- reports: `/ailed-status`, review, quality-gate, RCA, security scan;
- text pushed to an external tool (Jira, Confluence);
- changelog entries and release notes.

Two explicit exclusions:

- promotional content (`/ailed-promo`, promo outputs of `@ailed-communication`) follows the
  brand voice;
- code and commit messages follow `memory/conventions.md`.

## Language

The text uses the language of the `memory/` files, declared in `memory/config.md`.
The 12 rules apply to both languages. The English profile also relies on the ASD-STE100
dictionary. The French profile applies the same structural rules with its own list of
forbidden phrases.

## The 12 rules

| No. | Rule | Check |
| --- | ---- | ----- |
| 1 | One idea per sentence. A sentence carries one piece of information. | human |
| 2 | 20 words per sentence at most. 25 for an instruction. | `lint` |
| 3 | Active voice. The subject comes before the verb. | `lint` |
| 4 | Present tense. Imperative for an instruction. | human |
| 5 | One term = one meaning. Synonyms of the same concept are forbidden. | `lint` |
| 6 | No acronym that the glossary does not define. | `lint` |
| 7 | Three words per noun cluster at most. No chain of three "of". | `lint` |
| 8 | Keep articles and determiners. Telegraphic style is forbidden. | human |
| 9 | Six lines per paragraph at most. A procedure becomes a numbered list. | `lint` |
| 10 | Concrete verbs. Catch-all verbs are forbidden. | `lint` |
| 11 | Measured facts. A number, an ID or a file name replaces an adjective. | human |
| 12 | Positive sentences. Negation serves warnings, placed before their instruction. | human |

> Rule 2 sets a limit, not a target. An 8-word sentence stays better.
> Rule 5 relies on `memory/glossary.md`: one concept carries one name.

## Forbidden words and phrases

| Forbidden | Use instead |
| --------- | ----------- |
| `etc.` · `and so on` | the full list, or "3 examples: …" |
| `handle` · `manage` · `process` · `deal with` | the exact verb: create, validate, delete, send |
| `enable` · `allow to` · `make it possible to` | the direct verb |
| `address` (an issue) | fix, or correct the cause |
| `in order to` · `in the context of` · `at the level of` | to, in, on, for, during |
| `leverage` · `utilize` | use |
| `it should be noted that` · `indeed` · `furthermore` | nothing: delete the phrase |
| `might` · `could` · `seems to` (hedging) | the fact, or "unverified: …" |
| `various` · `several` · `multiple` | the exact number |
| `quickly` · `soon` | the date or the delay |
| `optimize` · `improve` (alone) | the measured target: "cut X from 800 ms to 200 ms" |

## Project dictionary

`memory/glossary.md` is the dictionary of authority. It carries the three columns rule 5
needs: the approved term, its single meaning, the forbidden synonyms.

An agent that meets a concept without an approved name adds a row to the glossary.
It never invents a synonym. It spells out an unknown acronym at its first use.
Then it adds that acronym to the glossary.

## Automatic check

```bash
npx @s2bp/ai-led-framework lint            # every memory/ file
npx @s2bp/ai-led-framework lint --strict   # warnings become blocking
npx @s2bp/ai-led-framework lint <path>     # one file or one folder
```

The report gives `file:line`, the rule and the offending extract. The exit code is `1` from
the first error. The `/ailed-quality-gate` skill includes this check in its checklist.

The check skips code, tables, headings and Mermaid diagrams: the rules apply to prose.

## Setting and limits

The standard is set in `memory/config.md`, section *Writing*. The `{{DISABLED}}` value
disables it: agents then follow the *Output style* alone.

This profile **derives** from ASD-STE100. It is not a certified implementation.
The ASD specification and its approved-word dictionary remain the property of the
*AeroSpace and Defence Industries Association of Europe*. The framework reuses the
principles, not the content.
