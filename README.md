# Build on headless with Salesforce: partner guide

A partner-facing walkthrough for the Q4 headless surge. It is for **presenting live with a partner**, not for sending to them. It is internal to the team, so please don't forward the page, the repo or the deck link to partners directly.

It pairs with a discovery deck: the guide shows partners their options, and the deck captures their answers.

- **Guide (this repo):** `dist/headless-partner-guide.html`, or the live artifact
- **Discovery deck:** [Headless partner discovery](https://docs.google.com/presentation/d/1roEum5jsbe-uFk_tJz0In2yDLmSKsUeaS9yFqxkAVcI/edit) (Google Slides)

## Get the guide

Clone this repo and open the folder in Claude. Don't download single files or work from the GitHub web page.

```bash
git clone git@github.com:LJ-000/q4headless.git
```

Then open the `q4headless` folder in Claude and ask it to open the guide or help you prepare for a meeting. To open the page yourself, double-click `dist/headless-partner-guide.html`. It is one self-contained file and needs no server.

**Need to edit or push changes?** You need collaborator access. Slack Laura to request it.

## Before the meeting

1. Make a copy of the discovery deck for this partner. Don't write in the master.
2. Open the guide in a browser tab and the copied deck in another. Share one screen, or show the guide while you type into the deck.
3. Check current status for any capability you plan to mention. The guide marks status only for released items; everything else says "Check current status".
4. Use the guide as is. It uses Acme and example.com as placeholder names, so don't edit in a partner's real company name.

## Running the session

Work down the page in order. Each step has a matching slide in the deck.

| Guide section | What to do | Deck slide |
| --- | --- | --- |
| Opening and "Why build on headless" | Set the frame in a minute: reach, reuse, trust, distribution. | 2–3 (how to use, partner snapshot) |
| Step 1: Your starting point | Ask the partner to pick the line that sounds like them: bring your MCP server, build a new MCP server, or build a new experience. The tabs switch the questions below. | 4 |
| Step 1: Questions to consider | Ask the four questions for the chosen path and note answers. | 5–7 |
| Step 2: Where do your customers work? | Pick one: in Salesforce; in Slack, Claude, ChatGPT or Teams; or not on Salesforce. | 9 |
| Questions to answer before you start | Four discovery questions about agentic strategy, MCP server, capabilities and a 6 to 12 month win. | 10 |
| 101: How it works | Pick the same path. It shows what the partner brings, how it connects, what's packaged and what the user sees. | 11 |
| Step 3: Patterns | Walk the table. Mark which patterns fit. | 12 |
| Your build plan | Five steps: architect, build, package, test (including Security Review), distribute. Agree owners and dates. | 13–14 |

Slide 8 in the deck, Use Case Ideation, is not tied to one guide section. Use it after the Step 1 questions to work through the partner's first use case.

## What's in the repo

- `index.html`, `page.css`, `page.js`: the page source. Copy and layout live in `index.html`; the tab logic is in `page.js`.
- `sfc/`, `assets/`, `manifest.json`: the design-stack runtime, fonts and images the page uses.
- `checks/`: browser checks for the opening and the sections.
- `dist/headless-partner-guide.html`: the single-file build. Open it in any browser.
- `dist/headless-partner-guide.artifact.html`: the same page, prepared for publishing as a live artifact.
