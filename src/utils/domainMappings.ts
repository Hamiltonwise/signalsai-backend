import type { DomainMapping } from "../types/global";

export const domainMappings: DomainMapping[] = [
  // Artful
  // {
  //   displayName: "Artful Orthodontics", //
  //   domain: "artfulorthodontics.com", //  domain identifier -- will be used by front-end for filtered fetching
  //   gsc_domainkey: "sc-domain:artfulorthodontics.com", // google search console -- ids retrievable via its api diag routes
  //   ga4_propertyId: "381278947", // google analytics -- ids retrievable via its api diag routes
  //   gbp_accountId: "114810842911950437772", // google business profile -- constant; relates to parent info@hamiltonwise account
  //   gbp_locationId: "10282052848626216313", // google business profile -- retrievable via its api diag routes
  //   clarity_projectId: "r9qqoq5h01", // microsoft clarity identifier --
  //   clarity_apiToken:
  //     "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiIxZGM5NGI5YS1lNmE3LTRlNTUtOTk0MC05OTZiNzI0YjUwNWUiLCJzdWIiOiIyNzY5NjA0Mzc4OTM1MTIxIiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTU1OCwiZXhwIjo0OTExNjE1NTU4LCJpYXQiOjE3NTgwMTU1NTgsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.NkE_Wtcy-odxLSBW4JyaGLqJmJzqyVfmz1mhTiVo1alfZdRskQrezUb3tZ-WgIarhF7dRt2TWuKQvePOKQD2mMOUmpDt5wXi0gJLBR8HxOJCOqu7b2Vhxy_85704I9HOCcs3gmj4Ar-Ffm1WnuGsJOIiYNRPD0I-coVkuz7k15-XgzyEQDj5PY7tkv3Z6QTG-dkNxxGJqj0zQTgRFiUuioEuouzWO_3blENKCsd7HT-kS5hyo7fJOJTRTnsukpSy2bcMfT0HJXfIGnqjnE-RsD7xQcTXsrHuqkovtPixCFxpZH-co1wx2TPDZ1JH3J1IQnF3ZOqiBalbNtv9AN39hA",
  //   completed: true,
  // },

  // Garrison
  {
    displayName: "Garrison Orthodontics",
    domain: "garrisonorthodontics.com",
    gsc_domainkey: "sc-domain:garrisonorthodontics.com",
    ga4_propertyId: "485402008",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "2137647135020773893",
    clarity_projectId: "r9diusipt9",
    clarity_apiToken:
      "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiJiNTZiYjMzMy03ODRlLTQxMjEtODkyZi03NjJhY2ExYjk3YjkiLCJzdWIiOiIyNzY4NTY4NTk3MzE3NDIxIiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTU5NSwiZXhwIjo0OTExNjE1NTk1LCJpYXQiOjE3NTgwMTU1OTUsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.It1EqeHcuUxs5dcdfDnTzF4cmH0FllVpbTtbMviX9GnghTkRpZBfl3GUH7wnhOjeVYnI9R-B8jW74U-OEBxY4GtFM-QeDwlg_AewCfeBWTAkuymIpiT_eZ0Mj5CFLkbISbNvxczGl92Xqps9b5EfgSfBsWDug2Q_pqXIYHrQhLnQ5L6g7wvNrpPKtDQMH0hgzYviGj2tQk76kfckUrSGJswAHcY32Kk95gMA6FasR8vEsZoI2v8zASY8Rf5bv3fm1JD1P2bX4dGeD3ETCT_ANIqeFSsfJHyzxHCHpw-K7W41mbkyRJKnHhA7KOxbdlirJG69FYg2hMsi7JJahNy1Pw",
    completed: true,
  },

  // Popup Smiles
  {
    displayName: "PopUp Smiles",
    domain: "popupsmiles.com",
    gsc_domainkey: "sc-domain:popupsmiles.com",
    ga4_propertyId: "493224130",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: [
      "109980361235418474", // Orange
      "5986586622648158122", // Newport
      "10463143860279697678", // San Juan Capistrano
      "6880513187032015995", // Onsite Dentistry
    ],
    clarity_projectId: "rn2q3umml3",
    clarity_apiToken:
      "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI0MWQ4NWM2MS03NGIzLTQ5YzMtYTFjZS03YWZiZWU0Mzc1ZWEiLCJzdWIiOiIyODA3MjE3OTE1NDMwMzU5Iiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTYzOSwiZXhwIjo0OTExNjE1NjM5LCJpYXQiOjE3NTgwMTU2MzksImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.kEtOure8uGUheswrh8Uizj8JK_ax99kApq7j0wcFilZrUxH6HUVbu_Tcmy7AEDfjcMFEfXSb8hZI8r4zS-1pdqX4nDulDWBJAgjhUWcW0teI2d3peXDbU7g18aI_LIOfPsNhtWhlJFg4tBU-Yne7igqz_lwzIfdZuq2Lm63DYAoFRs--9JseVFp1b7TXiQllHCkhhBLfp78o3FVwBNd_9Shu88cdPuzMnAez2EYTqIRZ7iXqkC7D1AF0DsJ2f9gx2-Y0P4a37AMV5xDlankW1YTQKJgMCJVMy8Kkmrvuo4xyuH7bLgNrrG-K7CAM0t9gWsEqb4A9GoZrRuksE76bBQ",
    completed: true,
  },

  // SDC
  {
    displayName: "San Diego Center for Endodontics",
    domain: "sdcendo.com",
    gsc_domainkey: "sc-domain:sdcendo.com",
    ga4_propertyId: "479214529",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "5912015385303248759",
    clarity_projectId: "r9dek9uzos",
    clarity_apiToken:
      "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiJlNTBiMDNkOS00M2JhLTQ1NTUtOTczNi02NmQwODhkMDZkYmQiLCJzdWIiOiIyNzY4NTU5MjU0MTg2Mjg0Iiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTY3MSwiZXhwIjo0OTExNjE1NjcxLCJpYXQiOjE3NTgwMTU2NzEsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.RtGwfoA1SQBOC3xM-Xm8NYxuunjYT1chSPahaHgIX5c2lctWxOZLlUbZtJK_uYhAK4Bi-3WWtcKOtPUpaHXnmpN65LaQY_MxQxzt3JkioRSX4NHrOhFDH4sSjgdgkUQ7yZ3wMoMkhG5PuP00of1K-NekxSz-dvHrSxYuvU6pC5R1miXuFgaVuJ52zozLueM74KvXt5024huO0l2WMul2kRDHSRl26uvGs8ONvC-qgOpWLKv3lk7fl2BQjPpvM2nk6vAnj0Q7cpOY-dcFAebpMZ92nIUR7UoP3ObaWyTOQc30kqG50k6PRCEVhbVzFXs1FwGtJxN6ZU_ak9KMJg0pjg",
    completed: true,
  },

  // Surf City
  {
    displayName: "Surf City Endodontics",
    domain: "surfcityendo.com",
    gsc_domainkey: "sc-domain:surfcityendo.com",
    ga4_propertyId: "376941141",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "17129961858390020882",
    clarity_projectId: "r9quk55sy8",
    completed: true,
    clarity_apiToken:
      "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI0NjlhNWM1MC1kNWRmLTRmMTctYTE5OS0xMzljZmU0MzlkN2UiLCJzdWIiOiIyNzY5NjEyODA4OTQzMzEyIiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTcwMSwiZXhwIjo0OTExNjE1NzAxLCJpYXQiOjE3NTgwMTU3MDEsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.XjcGUKgaLBh61_WTwBDvtNA0ZE4WtpMbVg-3KTQA9HZIjZzIwUxM-jGI0rZa1rJ6qk-oQAlCohrXjMXNRKsdO1_mlARvCFPVZtxSNyDHtSRWMteQuKxmQdKklsNLdaxWvt25ngCZXdRIkiMzYvO8Ezx4cFnjglOy91lflJTOivwuWS8fETBno-zqpzKE7fvDd-6pu2MnTGmeLdp_wZL6pvSx53eRoejTJUhYVle5CCHr4DH9h3X8ARDwP-aXHKvfuFC9-h7WbcWEPVVizUGO9RyN_IAC8AYkRMi7d2G9qIkWRZsod6pX6eNK9zi-aPFVLBoSxAF-vMWDRcREBIrOog",
  },

  // HamiltonWise
  {
    displayName: "HamiltonWise",
    domain: "hamiltonwise.com",
    gsc_domainkey: "sc-domain:hamiltonwise.com",
    ga4_propertyId: "348149125",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "10763524725470331855",
    clarity_projectId: "r9qvm1skrr",
    completed: true,
    clarity_apiToken:
      "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI3MDUzZjBlYi0xYjE3LTQ5YWEtODcxOS0xMjA1N2I0MjAzMGEiLCJzdWIiOiIyNzY5NjE1MTAxMDAyMDIzIiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTczMywiZXhwIjo0OTExNjE1NzMzLCJpYXQiOjE3NTgwMTU3MzMsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.Ce-ymqqytAsoFFl2tEQFbJVFB6C1HUEikKfSjZKE7e6C9e4bRyrPssC0-86ilSz0-TAkLf6q6d4VsNYCTvO7LC7aogbF2Wl92oVaO7fDqxfTMRhYVH5g2bQMB2j-gdb6qb5WoBbJpk1EY4D8hnxD_TfDwobTcsUmWzHt9dZGRuW2gvvOTVhKM652azE-hJKNReWILVd3nLt4qfDtZWJ2ydnfVUWv7zxchq9kTqZfh-5prSNQ2y9IytDUS9A0JitjquTdNDoun3XP5iK_mgpGC6GtDDL9wxdRr_sohQx8F6bBO0c-xL1dJE-RTyZVQ0eosthZF2Uk-3zzhcPmNfnpfA",
  },

  // DEMR
  {
    displayName: "DentalEMR",
    domain: "dentalemr.com",
    gsc_domainkey: "sc-domain:dentalemr.com",
    ga4_propertyId: "394259846",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "9121627934732959111",
    clarity_projectId: "rbqa7tqrl5",
    completed: true,
    clarity_apiToken:
      "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI1MDEyOGQ1Mi0xYWVmLTQwMzQtYjc2OC04MmVhNWIyYzc5YjYiLCJzdWIiOiIyNzc1MjEwNzQ4MzQwMDA5Iiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTc2MCwiZXhwIjo0OTExNjE1NzYwLCJpYXQiOjE3NTgwMTU3NjAsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.V7T9XVMlAPts4CXBCL8YgRxLbqGF3fiOrI4sZNTrM_c80RXEfyDk3xX_2xBdYhvgxDmMqaWEGOoaQoq1KzuE3Sol3g6Lr4W4NXOyROrtP7tvw2cWxBTeSkiKLG0WeyjNjbGF-N325Vpe3kggv6sCJBb1mHQp-iRt3_akFsfOY8kVk6947nZA5N5gz0qgHG8NmPuTBDHG8WwJw7AfkaInjZ8E1kY2A5zOnePmyJeeISqxIcWjkknlh3LrEC4seOFOqODh4xawuiBjb6185wKwG8aGIdb__Z90klhjlUHRmQNyWds6ZhRHYwMJOIMEOaMjoAyMMeh8nvgZ8DQ81MJ7xw",
  },

  // Caswell Orthdontics -- missing GBP
  {
    displayName: "Caswell Orthodontics",
    domain: "caswellorthodontics.com",
    gsc_domainkey: "sc-domain:caswellorthodontics.com",
    ga4_propertyId: "341429616",
    gbp_accountId: "",
    gbp_locationId: "",
    clarity_projectId: "r9qtvdfcgo",
    completed: false,
    clarity_apiToken:
      "eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ4M0FCMDhFNUYwRDMxNjdEOTRFMTQ3M0FEQTk2RTcyRDkwRUYwRkYiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiJmYTAzZmFkMC02ZGIzLTQwM2MtYjE4OS0zNTZlZmU4MjQ0ODkiLCJzdWIiOiIyNzY5NjExMzExMTcxMDMyIiwic2NvcGUiOiJEYXRhLkV4cG9ydCIsIm5iZiI6MTc1ODAxNTgxMSwiZXhwIjo0OTExNjE1ODExLCJpYXQiOjE3NTgwMTU4MTEsImlzcyI6ImNsYXJpdHkiLCJhdWQiOiJjbGFyaXR5LmRhdGEtZXhwb3J0ZXIifQ.d1uQnTjJvb22Bp22gflxReppCNQK6r0KdamIn2mvqlvRMVnsitt1vT_zGIg4b5Yt8_RgZxPreIZ67QWm5slpqdrhnxS8R_d-UpA1GPR68RcXw64mY253kZQ8Wn-_MaX1ytUnQdRjn5rkkSVRac7z3l9wI_uH3c276hzyCl_E0sZkrlm7ZjysC5yPx8IoIl9yCHzB20aIgXX7QR_3OuWp5yB1bElm9hJhiESjqyXR-hhNcJJ5rXmHe2oZwMuG5c8bwfdsL6seqnUt_QzfqL7nk-MqidnKUJDTVQjHM62Z-5lEmFaWTJGGyk1TGiAUFxacTigiiOPaFNMkMZJdKC8YMg",
  },

  // Kent Morris -- missing GSC, GA4, Clarity
  {
    displayName: "Kent Morris Orthodontics",
    domain: "kentmorrisorthodontics.com",
    gsc_domainkey: "",
    ga4_propertyId: "",
    gbp_accountId: "114810842911950437772",
    gbp_locationId: "18158491820874104161",
    clarity_projectId: "",
    completed: false,
  },
];
