# FMS and PMS Product Boundary

FreeMarketingStore and ProMarketingStore should share the same marketing platform language, but they should not blur responsibilities.

## Short Version

- **FMS** is the free marketing intelligence account: diagnose, plan, generate, export, and explain what to fix.
- **PMS** is the paid marketing execution account: connect channels, run campaigns, publish, send, measure, and optimize.

## Boundary Rule

If the product tells the user what to do, generates a reusable asset, or audits a public website, it belongs in FMS.

If the product performs work on behalf of the user through connected accounts, schedules, credentials, or paid execution, it belongs in PMS.

## FMS Owns

- Free sign-in and saved profile.
- Saved websites and website health dashboards.
- Website audits for crawlability, indexability, metadata, performance shape, accessibility basics, security headers, and PWA basics.
- Search Console connection and Cloudflare DNS verification setup.
- Basic Search Console import and indexing diagnostics.
- AI-ready fix prompts for website and marketing issues.
- Planning tools: launch checklist, campaign planner, content calendar, UTM builder, A/B calculator.
- SEO/content tools: keyword planner, meta generator, domain finder, content writer, subject lines, headlines, personas, value proposition.
- Exports to Markdown, CSV, prompt text, JSON, or future PMS campaign drafts.

FMS can have accounts and still be free. The account stores diagnostics and planning state, not execution authority.

## FMS Free Account Foundation

The first account slice stores:

- User identity from Google sign-in.
- Signed session cookies.
- Saved websites.
- Audit history per site.
- Latest audit summary for dashboards.
- Local browser-site import after sign-in.

The account should not store social publishing credentials or campaign execution state. Those are PMS concerns.

## PMS Owns

- Paid profile and subscription.
- Brand memory, campaign goals, campaign plans, and campaign approvals.
- Social account OAuth and publishing.
- Email sending and sequence execution.
- AI campaign agent that creates a plan, drafts content, requests approval, schedules, publishes, measures, and revises.
- Cross-channel campaign analytics.
- Marketplace services and human-assisted campaign packages.
- Team/client workflows around campaign execution.

PMS can use FMS website health data as campaign readiness input, but PMS should not become a generic toolbox.

## Account Model

| Capability | FMS Free | PMS Pro |
| --- | --- | --- |
| Sign-in | Yes | Yes |
| Saved sites | Yes | Uses/imports |
| Website audits | Yes | Reads readiness |
| Search Console import | Yes, limited | Campaign context |
| Audit history | Basic | Extended/campaign-linked |
| AI fix prompts | Yes | Turns prompts into campaign tasks |
| Scheduled checks | Limited | Higher limits |
| Campaign planning | Templates/basic | Agentic |
| Social publishing | No | Yes |
| Email sending | No | Yes |
| Autonomous optimization | Suggestions | Execution loop |
| Marketplace | No | Yes |

## FMS Free Limits

Suggested initial limits:

- 3 to 10 saved websites.
- Manual audits plus limited scheduled checks.
- Basic audit history.
- Search Console connection for verified owned sites.
- Exportable issue prompts.

Do not include:

- Posting to social networks.
- Sending emails.
- Paid ad spend.
- Creator marketplace work.
- Fully automated campaign optimization.

## Funnel

1. User finds FMS through free tools or website audit.
2. FMS saves their sites and builds a Marketing Readiness Score.
3. FMS explains what blocks SEO, trust, tracking, and campaign readiness.
4. PMS offers to turn the readiness profile into a campaign: "Create a 30-day campaign from this site."
5. PMS runs the campaign with approvals, connected channels, metrics, and optimization.

## Marketing Coverage Map

| Marketing area | FMS | PMS |
| --- | --- | --- |
| Foundation | Brand/ICP/value tools | Brand memory and campaign context |
| Website presence | Audit and Search Console readiness | Uses readiness before campaigns |
| Planning | Templates, calendars, checklists | Agent-generated campaign plan |
| Creation | One-off generators | Campaign-connected content pipeline |
| Distribution | Export/manual handoff | Publish/send/schedule |
| Measurement | Basic site/search diagnostics | Cross-channel campaign analytics |
| Optimization | Suggestions and prompts | Automated revision loop |
| Services | None or discovery only | Marketplace and packages |

## Paid Ads

Paid ad execution should not be part of FMS.

Short term, PMS can generate ad copy and campaign plans. Actual ad buying, budget control, bidding, and ROAS optimization should either be a separate ProAdStore/PADS product or a clearly isolated paid-media module because mistakes spend money.
