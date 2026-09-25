/**
 * Gold-standard sample CSV for the Contact Import wizard (PRD sec. 36-37).
 *
 * Columns match the MAPPABLE definitions in import-wizard.tsx and their
 * synonyms (e.g. "first_name", "firstname", "given name" all resolve to
 * firstName). Tags should be semicolon- or pipe-separated.
 *
 * Users can copy this text into their upload CSV, adjust the values, and
 * map columns on the preview step.  Duplicate detection uses email (case-
 * insensitive) then phone (digits) -- never auto-merge.
 *
 * To add custom-field values, include extra columns whose headers match
 * the field_key of active custom_fields; those columns are passed through
 * to contact_custom_values on import.
 */
export const SAMPLE_CSV = `firstName,lastName,email,phone,company,address,city,province,country,postalCode,contactType,source,tags,notes
John,Doe,john.doe@example.com,555-0101,Acme Corp,123 Main St,Springfield,IL,USA,62704,Lead,Manual entry,Buyer;Seller,"Interested in commercial property"
Jane,Smith,jane.smith@north.io,555-0987,beta Co,456 Oak Ave,Portland,OR,USA,97201,Contact,Imported,jane.smith@north.io|past-client,"Recently moved to OR"
Bob,Builder,bob.builder@build.io,555-5050,BuildIt Inc,,Seattle,WA,USA,98101,Prospect,Website,Buyer,Notes: site visit 2026-04-15
Aisha,Ahmed,aisha@globaltrade.org,555-1234,,,London,,UK,SW1A 1AA,Global,Import,"Investor","Deal in progress; Due diligence Q3"
Maria,Gomez,maria.gomez@dev corp,555-9999,Dev Corp,789 Pine Rd,Miami,FL,USA,33101,Customer,Referral,First-Time Buyer,Property Type: beachfront;Budget: $500k+ Met with agent 2026-04-10`;
// NB: the preview step parses this with parseCsv() which follows RFC-4180;
// commas inside quoted fields are preserved; tags use ; or | as separators.

export default SAMPLE_CSV;
