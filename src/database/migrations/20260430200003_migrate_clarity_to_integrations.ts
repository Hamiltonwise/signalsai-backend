import type { Knex } from "knex";
import { encrypt } from "../../utils/encryption";

interface ClarityMapping {
  domain: string;
  clarity_projectId: string;
  clarity_apiToken: string;
}

const CLARITY_MAPPINGS: ClarityMapping[] = [
  { domain: "artfulorthodontics.com", clarity_projectId: "r9qqoq5h01", clarity_apiToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiIxZGM5NGI5YS1lNmE3LTRlNTUtOTk0MC05OTZiNzI0YjUwNWUiLCJzdWIiOiIyNzY5NjA0Mzc4OTM1MTIxIiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTU1OCwiZXhwIjo0OTExNjE1NTU4LCJpYXQiOjE3NTgwMTU1NTgsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.NkE_Wtcy-odxLSBW4JyaGLqJmJzqyVfmz1mhTiVo1alfZdRskQrezUb3tZ-WgIarhF7dRt2TWuKQvePOKQD2mMOUmpDt5wXi0gJLBR8HxOJCOqu7b2Vhxy_85704I9HOCcs3gmj4Ar-Ffm1WnuGsJOIiYNRPD0I-coVkuz7k15-XgzyEQDj5PY7tkv3Z6QTG-dkNxxGJqj0zQTgRFiUuioEuouzWO_3blENKCsd7HT-kS5hyo7fJOJTRTnsukpSy2bcMfT0HJXfIGnqjnE-RsD7xQcTXsrHuqkovtPixCFxpZH-co1wx2TPDZ1JH3J1IQnF3ZOqiBalbNtv9AN39hA" },
  { domain: "garrisonorthodontics.com", clarity_projectId: "r9diusipt9", clarity_apiToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiJiNTZiYjMzMy03ODRlLTQxMjEtODkyZi03NjJhY2ExYjk3YjkiLCJzdWIiOiIyNzY4NTY4NTk3MzE3NDIxIiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTU5NSwiZXhwIjo0OTExNjE1NTk1LCJpYXQiOjE3NTgwMTU1OTUsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.It1EqeHcuUxs5dcdfDnTzF4cmH0FllVpbTtbMviX9GnghTkRpZBfl3GUH7wnhOjeVYnI9R-B8jW74U-OEBxY4GtFM-QeDwlg_AewCfeBWTAkuymIpiT_eZ0Mj5CFLkbISbNvxczGl92Xqps9b5EfgSfBsWDug2Q_pqXIYHrQhLnQ5L6g7wvNrpPKtDQMH0hgzYviGj2tQk76kfckUrSGJswAHcY32Kk95gMA6FasR8vEsZoI2v8zASY8Rf5bv3fm1JD1P2bX4dGeD3ETCT_ANIqeFSsfJHyzxHCHpw-K7W41mbkyRJKnHhA7KOxbdlirJG69FYg2hMsi7JJahNy1Pw" },
  { domain: "popupsmiles.com", clarity_projectId: "rn2q3umml3", clarity_apiToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI0MWQ4NWM2MS03NGIzLTQ5YzMtYTFjZS03YWZiZWU0Mzc1ZWEiLCJzdWIiOiIyODA3MjE3OTE1NDMwMzU5Iiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTYzOSwiZXhwIjo0OTExNjE1NjM5LCJpYXQiOjE3NTgwMTU2MzksImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.kEtOure8uGUheswrh8Uizj8JK_ax99kApq7j0wcFilZrUxH6HUVbu_Tcmy7AEDfjcMFEfXSb8hZI8r4zS-1pdqX4nDulDWBJAgjhUWcW0teI2d3peXDbU7g18aI_LIOfPsNhtWhlJFg4tBU-Yne7igqz_lwzIfdZuq2Lm63DYAoFRs--9JseVFp1b7TXiQllHCkhhBLfp78o3FVwBNd_9Shu88cdPuzMnAez2EYTqIRZ7iXqkC7D1AF0DsJ2f9gx2-Y0P4a37AMV5xDlankW1YTQKJgMCJVMy8Kkmrvuo4xyuH7bLgNrrG-K7CAM0t9gWsEqb4A9GoZrRuksE76bBQ" },
  { domain: "sdcendo.com", clarity_projectId: "r9dek9uzos", clarity_apiToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiJlNTBiMDNkOS00M2JhLTQ1NTUtOTczNi02NmQwODhkMDZkYmQiLCJzdWIiOiIyNzY4NTU5MjU0MTg2Mjg0Iiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTY3MSwiZXhwIjo0OTExNjE1NjcxLCJpYXQiOjE3NTgwMTU2NzEsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.RtGwfoA1SQBOC3xM-Xm8NYxuunjYT1chSPahaHgIX5c2lctWxOZLlUbZtJK_uYhAK4Bi-3WWtcKOtPUpaHXnmpN65LaQY_MxQxzt3JkioRSX4NHrOhFDH4sSjgdgkUQ7yZ3wMoMkhG5PuP00of1K-NekxSz-dvHrSxYuvU6pC5R1miXuFgaVuJ52zozLueM74KvXt5024huO0l2WMul2kRDHSRl26uvGs8ONvC-qgOpWLKv3lk7fl2BQjPpvM2nk6vAnj0Q7cpOY-dcFAebpMZ92nIUR7UoP3ObaWyTOQc30kqG50k6PRCEVhbVzFXs1FwGtJxN6ZU_ak9KMJg0pjg" },
  { domain: "surfcityendo.com", clarity_projectId: "r9quk55sy8", clarity_apiToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI0NjlhNWM1MC1kNWRmLTRmMTctYTE5OS0xMzljZmU0MzlkN2UiLCJzdWIiOiIyNzY5NjEyODA4OTQzMzEyIiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTcwMSwiZXhwIjo0OTExNjE1NzAxLCJpYXQiOjE3NTgwMTU3MDEsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.XjcGUKgaLBh61_WTwBDvtNA0ZE4WtpMbVg-3KTQA9HZIjZzIwUxM-jGI0rZa1rJ6qk-oQAlCohrXjMXNRKsdO1_mlARvCFPVZtxSNyDHtSRWMteQuKxmQdKklsNLdaxWvt25ngCZXdRIkiMzYvO8Ezx4cFnjglOy91lflJTOivwuWS8fETBno-zqpzKE7fvDd-6pu2MnTGmeLdp_wZL6pvSx53eRoejTJUhYVle5CCHr4DH9h3X8ARDwP-aXHKvfuFC9-h7WbcWEPVVizUGO9RyN_IAC8AYkRMi7d2G9qIkWRZsod6pX6eNK9zi-aPFVLBoSxAF-vMWDRcREBIrOog" },
  { domain: "hamiltonwise.com", clarity_projectId: "r9qvm1skrr", clarity_apiToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI3MDUzZjBlYi0xYjE3LTQ5YWEtODcxOS0xMjA1N2I0MjAzMGEiLCJzdWIiOiIyNzY5NjE1MTAxMDAyMDIzIiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTczMywiZXhwIjo0OTExNjE1NzMzLCJpYXQiOjE3NTgwMTU3MzMsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.Ce-ymqqytAsoFFl2tEQFbJVFB6C1HUEikKfSjZKE7e6C9e4bRyrPssC0-86ilSz0-TAkLf6q6d4VsNYCTvO7LC7aogbF2Wl92oVaO7fDqxfTMRhYVH5g2bQMB2j-gdb6qb5WoBbJpk1EY4D8hnxD_TfDwobTcsUmWzHt9dZGRuW2gvvOTVhKM652azE-hJKNReWILVd3nLt4qfDtZWJ2ydnfVUWv7zxchq9kTqZfh-5prSNQ2y9IytDUS9A0JitjquTdNDoun3XP5iK_mgpGC6GtDDL9wxdRr_sohQx8F6bBO0c-xL1dJE-RTyZVQ0eosthZF2Uk-3zzhcPmNfnpfA" },
  { domain: "dentalemr.com", clarity_projectId: "rbqa7tqrl5", clarity_apiToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI1MDEyOGQ1Mi0xYWVmLTQwMzQtYjc2OC04MmVhNWIyYzc5YjYiLCJzdWIiOiIyNzc1MjEwNzQ4MzQwMDA5Iiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTc2MCwiZXhwIjo0OTExNjE1NzYwLCJpYXQiOjE3NTgwMTU3NjAsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.V7T9XVMlAPts4CXBCL8YgRxLbqGF3fiOrI4sZNTrM_c80RXEfyDk3xX_2xBdYhvgxDmMqaWEGOoaQoq1KzuE3Sol3g6Lr4W4NXOyROrtP7tvw2cWxBTeSkiKLG0WeyjNjbGF-N325Vpe3kggv6sCJBb1mHQp-iRt3_akFsfOY8kVk6947nZA5N5gz0qgHG8NmPuTBDHG8WwJw7AfkaInjZ8E1kY2A5zOnePmyJeeISqxIcWjkknlh3LrEC4seOFOqODh4xawuiBjb6185wKwG8aGIdb__Z90klhjlUHRmQNyWds6ZhRHYwMJOIMEOaMjoAyMMeh8nvgZ8DQ81MJ7xw" },
  { domain: "caswellorthodontics.com", clarity_projectId: "r9qtvdfcgo", clarity_apiToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiJmYTAzZmFkMC02ZGIzLTQwM2MtYjE4OS0zNTZlZmU4MjQ0ODkiLCJzdWIiOiIyNzY5NjExMzExMTcxMDMyIiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTgxMSwiZXhwIjo0OTExNjE1ODExLCJpYXQiOjE3NTgwMTU4MTEsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.d1uQnTjJvb22Bp22gflxReppCNQK6r0KdamIn2mvqlvRMVnsitt1vT_zGIg4b5Yt8_RgZxPreIZ67QWm5slpqdrhnxS8R_d-UpA1GPR68RcXw64mY253kZQ8Wn-_MaX1ytUnQdRjn5rkkSVRac7z3l9wI_uH3c276hzyCl_E0sZkrlm7ZjysC5yPx8IoIl9yCHzB20aIgXX7QR_3OuWp5yB1bElm9hJhiESjqyXR-hhNcJJ5rXmHe2oZwMuG5c8bwfdsL6seqnUt_QzfqL7nk-MqidnKUJDTVQjHM62Z-5lEmFaWTJGGyk1TGiAUFxacTigiiOPaFNMkMZJdKC8YMg" },
];

export async function up(knex: Knex): Promise<void> {
  for (const mapping of CLARITY_MAPPINGS) {
    const project = await knex("website_builder.projects")
      .select("id")
      .where("custom_domain", mapping.domain)
      .orWhere("custom_domain_alt", mapping.domain)
      .first();

    if (!project) {
      console.warn(`[clarity-migration] No project found for domain: ${mapping.domain} — skipping`);
      continue;
    }

    const existing = await knex("website_builder.website_integrations")
      .where({ project_id: project.id, platform: "clarity" })
      .first();

    if (existing) {
      console.log(`[clarity-migration] Integration already exists for ${mapping.domain} — skipping`);
      continue;
    }

    const encryptedToken = encrypt(mapping.clarity_apiToken);

    await knex("website_builder.website_integrations").insert({
      project_id: project.id,
      platform: "clarity",
      type: "hybrid",
      label: null,
      encrypted_credentials: encryptedToken,
      metadata: JSON.stringify({
        projectId: mapping.clarity_projectId,
        domain: mapping.domain,
      }),
      status: "active",
      connected_by: "system",
      created_at: new Date(),
      updated_at: new Date(),
    });

    console.log(`[clarity-migration] Created integration for ${mapping.domain} (project ${project.id})`);

    const rows = await knex("public.clarity_data_store")
      .select(
        knex.raw("DISTINCT ON (domain, report_date) domain, report_date, data, created_at"),
      )
      .where("domain", mapping.domain)
      .orderByRaw("domain, report_date, created_at DESC");

    if (rows.length > 0) {
      const inserts = rows.map((row: { report_date: string; data: unknown; created_at: Date }) => ({
        project_id: project.id,
        report_date: row.report_date,
        data: typeof row.data === "string" ? row.data : JSON.stringify(row.data),
        created_at: row.created_at,
        updated_at: new Date(),
      }));

      await knex("website_builder.clarity_data")
        .insert(inserts)
        .onConflict(["project_id", "report_date"])
        .ignore();

      console.log(`[clarity-migration] Copied ${inserts.length} data rows for ${mapping.domain}`);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("website_builder.website_integrations")
    .where({ platform: "clarity", connected_by: "system" })
    .del();

  await knex("website_builder.clarity_data").del();
}
