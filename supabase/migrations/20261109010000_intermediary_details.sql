-- Intermediary details (Gabriel, Nov 9 2026): company name, VAT / EORI, contact name, contact phone, email, address.
-- Additive only: three new optional columns; `contact` keeps the contact NAME. Admin writes, staff reads (policies unchanged).
alter table public.intermediaries
  add column if not exists vat_eori      text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text;

comment on column public.intermediaries.contact is 'Contact name';
comment on column public.intermediaries.vat_eori is 'VAT / EORI information';
