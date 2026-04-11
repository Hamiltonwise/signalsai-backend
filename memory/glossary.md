# Alloro Glossary

## People
| Shorthand | Full | Context |
|-----------|------|---------|
| Jo | Jordan Caballero | COO/Integrator |
| Dave | Rustine Dave | CTO, Philippines |
| Meredith/Merideth | Merideth Glasco | DentalEMR CEO |
| Safe / Dr. Cuda | Dr. Safe Cuda | One Endo, Go Live client |
| Garrison | Dr. Garrison Copeland | Garrison Orthodontics client |
| Maria | Maria (Artful) | Artful Orthodontics office manager |
| Sophie | Sophie Wise | Corey's daughter, 8 months old |
| Lindsey | Lindsey Wise | Corey's partner |
| Shawn | Shawn McPherson | Study club model, beta client |
| Chris | Chris Olson | Endodontist in CA, the "face of why" |
| Kargoli / Saif | Dr. Saif Kargoli | One Endo admin (org 39, 1endodontics.com), Falls Church |

## Products & Features
| Term | Meaning |
|------|---------|
| PatientPath | AI-built website for businesses, built from reviews + market data |
| ClearPath | GP/referral discovery page for referring sources |
| Checkup | Free lead-gen tool: enter practice name, get competitor analysis |
| Monday email | Weekly intelligence brief, sent Monday 7am local time |
| Oz Pearlman Moment | "I didn't do anything and it's already working" |
| Queer Eye / Makeover | PatientPath website reveal -- site built before they ask |
| The Blood Panel | Home page design: raw readings, no scores, doctor reads the panel |
| One Action Card | Single highest-priority action on Home page |
| Watchline | Highest-priority true signal, or nothing |
| Surprise Engine | surpriseFindings.ts -- 6 finding types scored on surprise + actionability |
| DFY Engine | Done-For-You automation layer |

## Critical Corrections (Do Not Repeat These Mistakes)
| Wrong Assumption | Reality |
|------------------|---------|
| "Blocked by EC2" / "Blocked by Dave" for sandbox | Sandbox EC2 auto-deploys on every git push to sandbox branch. CI/CD pipeline works. No Dave dependency for sandbox deployment. |
| "Dave is needed to deploy" | Dave merges to main and manages production. Sandbox is CC + Corey's domain. Push to sandbox = deployed. |
| "Infrastructure is blocking features" | If something isn't working on sandbox, it's a code/routing/UI problem, not infrastructure. Fix it directly. |

## Technical
| Term | Meaning |
|------|---------|
| CC | Claude Code (builds in sandbox) |
| GBP | Google Business Profile |
| GSC | Google Search Console |
| PMS | Practice Management System (or any business data system) |
| Vision Parser | Claude Vision service that extracts data from ANY image/PDF |
| TTFV | Time To First Value |
| NRR | Net Revenue Retention |
| AAE | American Association of Endodontists (conference April 15-18) |
| ICP | Ideal Customer Profile |

## Blast Radius
| Level | Meaning |
|-------|---------|
| Green | Auto-execute: test files, new components, non-auth routes |
| Yellow | Notify #alloro-dev, then build: DB migrations, nav changes, new API endpoints |
| Red | Stop. Corey approves: billing, auth, pricing, client copy, data deletion |

## Rules
| Rule | Meaning |
|------|---------|
| No em-dashes | In any output |
| No text-[10px] or text-[11px] | Min font: text-xs (12px) |
| No font-black or font-extrabold | Max weight: font-semibold |
| No #212D40 for text | Use #1A1D23 |
| No fabricated content | Ever |
| No position claims | Known 3: no Google search position numbers shown to customers |
| No composite scores | Known 3: no single-number scores combining multiple metrics |
| Universal language | "business" not "practice", "customers" not "patients" |
| The Standard | "Does it make a human feel understood before it makes them feel informed?" |
