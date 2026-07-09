-- ════════════════════════════════════════════════
--  Controlia CRM — Schéma Supabase
--  Coller dans : Supabase → SQL Editor → New query
-- ════════════════════════════════════════════════

-- Table des contacts / prospects
create table if not exists contacts (
  id              text        primary key,
  nom             text        not null default '',
  entreprise      text        not null default '',
  telephone       text        not null default '',
  email           text        not null default '',
  source          text        not null default 'Appel à froid',
  statut          text        not null default 'Nouveau',
  valeur          numeric     not null default 0,
  notes           text        not null default '',
  date_relance    timestamptz,
  date_creation   timestamptz not null default now(),
  historique      jsonb       not null default '[]'::jsonb,
  updated_at      timestamptz not null default now()
);

-- Table des devis
create table if not exists devis (
  id                  text        primary key,
  numero              text        unique,
  client_nom          text        not null default '',
  client_entreprise   text        not null default '',
  client_email        text        not null default '',
  client_telephone    text        not null default '',
  client_adresse      text        not null default '',
  lignes              jsonb       not null default '[]'::jsonb,
  tva                 numeric     not null default 20,
  statut              text        not null default 'Brouillon',
  date_creation       timestamptz not null default now(),
  date_validite       date,
  notes               text        not null default '',
  updated_at          timestamptz not null default now()
);

-- Index pour améliorer les tris / filtres fréquents
create index if not exists contacts_statut_idx        on contacts (statut);
create index if not exists contacts_date_relance_idx  on contacts (date_relance);
create index if not exists devis_statut_idx           on devis (statut);

-- Statuts attendus :
--   contacts : Nouveau | Contacté | RDV | Proposition | Gagné | Perdu
--   devis    : Brouillon | Envoyé | Accepté | Refusé
