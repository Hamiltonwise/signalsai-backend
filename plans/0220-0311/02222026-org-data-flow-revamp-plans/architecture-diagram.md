# Data Architecture — Before & After

## CURRENT Architecture (Before)

```mermaid
erDiagram
    users {
        int id PK
        string email
        string password_hash
        string first_name
        string last_name
        string phone
    }

    organizations {
        int id PK
        string name
        string domain
        string subscription_tier
        boolean onboarding_completed
        jsonb setup_progress
    }

    organization_users {
        int user_id FK
        int organization_id FK
        string role
    }

    google_connections {
        int id PK
        int organization_id FK
        string google_user_id
        string email
        string refresh_token
        jsonb google_property_ids
    }

    agent_results {
        int id PK
        int organization_id FK "nullable"
        string domain "scoping key"
        string agent_type
        jsonb agent_output
        string status
    }

    agent_recommendations {
        int id PK
        int agent_result_id FK
        string verdict
        string status
    }

    tasks {
        int id PK
        int organization_id FK "nullable"
        string domain_name "scoping key"
        string title
        string category
        string status
    }

    pms_jobs {
        int id PK
        string domain "ONLY scoping key"
        string status
        jsonb response_log
        jsonb automation_status_detail
    }

    practice_rankings {
        int id PK
        int organization_id FK "nullable"
        string domain
        string gbp_location_id "GBP API string"
        string status
        jsonb llm_analysis
    }

    notifications {
        int id PK
        int organization_id FK "nullable"
        string domain_name "scoping key"
        string title
        string type
    }

    website_builder_projects {
        uuid id PK
        int organization_id FK
        string status
        string generated_hostname
    }

    users ||--o{ organization_users : "belongs to"
    organizations ||--o{ organization_users : "has members"
    organizations ||--o{ google_connections : "has connections"
    agent_results ||--o{ agent_recommendations : "has recommendations"
    organizations ||--o{ website_builder_projects : "has website"

    %% PROBLEM: These tables use domain string, not FK
    %% agent_results --- organizations : "via domain string (loose)"
    %% tasks --- organizations : "via domain string (loose)"
    %% pms_jobs --- organizations : "NO relationship!"
    %% notifications --- organizations : "via domain string (loose)"
```

### Problems with Current Architecture

1. **`pms_jobs`** has NO organization_id — data scoped only by domain string
2. **`agent_results`**, **`tasks`**, **`notifications`** have nullable org_id and primarily query by domain string
3. **No location concept** — all data is flat per-organization
4. **GBP locations stored as JSON blob** in `google_connections.google_property_ids`
5. **No per-user location scoping** — all users see all org data

---

## NEW Architecture (After)

```mermaid
erDiagram
    users {
        int id PK
        string email
        string password_hash
        string first_name
        string last_name
        string phone
    }

    organizations {
        int id PK
        string name
        string domain
        string subscription_tier
        boolean onboarding_completed
        jsonb setup_progress
    }

    organization_users {
        int user_id FK
        int organization_id FK
        string role
    }

    locations {
        int id PK
        int organization_id FK
        string name
        string domain "nullable"
        boolean is_primary
    }

    user_locations {
        int user_id FK
        int location_id FK
    }

    google_connections {
        int id PK
        int organization_id FK
        string google_user_id
        string email
        string refresh_token
    }

    google_properties {
        int id PK
        int location_id FK
        int google_connection_id FK
        string type
        string external_id
        string account_id
        string display_name
    }

    agent_results {
        int id PK
        int organization_id FK
        int location_id FK
        string domain "kept for compat"
        string agent_type
        jsonb agent_output
        string status
    }

    agent_recommendations {
        int id PK
        int agent_result_id FK
        string verdict
        string status
    }

    tasks {
        int id PK
        int organization_id FK
        int location_id FK
        string domain_name "kept for compat"
        string title
        string category
        string status
    }

    pms_jobs {
        int id PK
        int organization_id FK "NEW"
        int location_id FK "NEW"
        string domain "kept for compat"
        string status
        jsonb response_log
    }

    practice_rankings {
        int id PK
        int organization_id FK
        int location_id FK "NEW"
        string domain
        string gbp_location_id "GBP API string"
        string status
        jsonb llm_analysis
    }

    notifications {
        int id PK
        int organization_id FK
        int location_id FK "NEW"
        string domain_name "kept for compat"
        string title
        string type
    }

    website_builder_projects {
        uuid id PK
        int organization_id FK
        string status
        string generated_hostname
    }

    %% Core relationships
    users ||--o{ organization_users : "belongs to"
    organizations ||--o{ organization_users : "has members"
    organizations ||--o{ locations : "has locations"
    organizations ||--o{ google_connections : "has connections"

    %% Location relationships
    locations ||--o{ google_properties : "has GBP properties"
    google_connections ||--o{ google_properties : "provides OAuth"
    users ||--o{ user_locations : "has access to"
    locations ||--o{ user_locations : "accessible by"

    %% Data ownership — ALL through org_id + location_id
    organizations ||--o{ agent_results : "owns"
    locations ||--o{ agent_results : "scoped to"
    organizations ||--o{ tasks : "owns"
    locations ||--o{ tasks : "scoped to"
    organizations ||--o{ pms_jobs : "owns"
    locations ||--o{ pms_jobs : "scoped to"
    organizations ||--o{ practice_rankings : "owns"
    locations ||--o{ practice_rankings : "scoped to"
    organizations ||--o{ notifications : "owns"
    locations ||--o{ notifications : "scoped to"
    organizations ||--o{ website_builder_projects : "has website"

    agent_results ||--o{ agent_recommendations : "has recommendations"
```

---

## Data Access Flow (New)

```mermaid
flowchart TD
    subgraph Frontend
        A[User logs in] --> B[AuthContext loads userProfile]
        B --> C[LocationProvider loads locations]
        C --> D{Multiple locations?}
        D -->|Yes| E[Show LocationSwitcher]
        D -->|No| F[Auto-select primary]
        E --> G[User selects location]
        F --> G
        G --> H[All API calls include\norganizationId + locationId]
    end

    subgraph Backend API
        H --> I[RBAC Middleware]
        I --> J{User role?}
        J -->|Admin| K[Access ALL org locations]
        J -->|Manager/Viewer| L[Check user_locations table]
        L --> M{Has access?}
        M -->|Yes| N[Query data\nWHERE org_id AND location_id]
        M -->|No| O[403 Forbidden]
        K --> N
    end

    subgraph Database
        N --> P[(agent_results\norg_id + location_id)]
        N --> Q[(tasks\norg_id + location_id)]
        N --> R[(pms_jobs\norg_id + location_id)]
        N --> S[(practice_rankings\norg_id + location_id)]
        N --> T[(notifications\norg_id + location_id)]
    end
```

---

## Agent Execution Flow (New)

```mermaid
flowchart TD
    subgraph "Agent Trigger"
        A[Cron / PMS Upload / Manual] --> B[Fetch google_connection]
        B --> C[Get organization_id from connection]
        C --> D[resolveLocationId\nfrom GBP location being processed]
    end

    subgraph "Agent Processing"
        D --> E[Run agent\nproofline / monthly / ranking / etc]
        E --> F{Agent type?}
        F -->|Per-location| G[Process specific GBP location]
        F -->|Per-org| H[Process primary location]
        F -->|SYSTEM| I[No org/location - global]
    end

    subgraph "Data Storage"
        G --> J[INSERT agent_results\norg_id + location_id]
        H --> J
        I --> K[INSERT agent_results\norg_id=NULL, location_id=NULL]
        J --> L[INSERT tasks via task-creator\norg_id + location_id]
        J --> M[INSERT notifications\norg_id + location_id]
    end
```

---

## Location Hierarchy

```mermaid
graph TD
    ORG[Organization<br/>id: 5, name: Hamilton Wise] --> LOC1[Location 1<br/>Downtown Office<br/>is_primary: true]
    ORG --> LOC2[Location 2<br/>Suburban Branch<br/>is_primary: false]

    LOC1 --> GP1[Google Property<br/>GBP: locations/111<br/>Hamilton Wise Downtown]
    LOC2 --> GP2[Google Property<br/>GBP: locations/222<br/>Hamilton Wise Suburban]

    GP1 -.-> GC[Google Connection<br/>OAuth tokens<br/>org_id: 5]
    GP2 -.-> GC

    LOC1 --> AR1[Agent Results<br/>location_id: 1]
    LOC1 --> T1[Tasks<br/>location_id: 1]
    LOC1 --> PMS1[PMS Jobs<br/>location_id: 1]
    LOC1 --> PR1[Practice Rankings<br/>location_id: 1]

    LOC2 --> AR2[Agent Results<br/>location_id: 2]
    LOC2 --> T2[Tasks<br/>location_id: 2]
    LOC2 --> PMS2[PMS Jobs<br/>location_id: 2]
    LOC2 --> PR2[Practice Rankings<br/>location_id: 2]

    subgraph "User Access"
        ADMIN[Admin User<br/>Sees ALL locations]
        MANAGER[Manager User<br/>user_locations: 1,2]
        VIEWER[Viewer User<br/>user_locations: 1]
    end

    ADMIN -.-> LOC1
    ADMIN -.-> LOC2
    MANAGER -.-> LOC1
    MANAGER -.-> LOC2
    VIEWER -.-> LOC1
```

---

## Migration Sequence

```mermaid
gantt
    title Data Revamp Migration Sequence
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section Plan 01 - Foundation
    Create locations table           :p1a, 2026-02-23, 1d
    Create google_properties table   :p1b, after p1a, 1d
    Create user_locations table      :p1c, after p1b, 1d
    Seed locations from GBP data     :p1d, after p1c, 1d

    section Plan 02 - Schema
    Add location_id columns          :p2a, after p1d, 1d
    Add org_id to pms_jobs           :p2b, after p1d, 1d

    section Plan 03 - Backfill
    Backfill org_id on pms_jobs      :p3a, after p2b, 1d
    Backfill location_id all tables  :p3b, after p3a, 1d
    Add composite indexes            :p3c, after p3b, 1d

    section Plan 04 - Agents
    Create resolveLocationId utility :p4a, after p3c, 1d
    Update AgentsController          :p4b, after p4a, 2d
    Update task-creator service      :p4c, after p4b, 1d
    Update PMS upload service        :p4d, after p4c, 1d

    section Plan 05 - API
    Location-aware RBAC middleware   :p5a, after p4d, 2d
    Migrate client endpoints         :p5b, after p5a, 3d
    Add model query methods          :p5c, after p5a, 2d

    section Plan 06 - Frontend
    LocationContext + Provider        :p6a, after p5b, 2d
    Location Switcher UI             :p6b, after p6a, 1d
    Update API modules               :p6c, after p6a, 2d
    Update data-fetching hooks       :p6d, after p6c, 2d
```
