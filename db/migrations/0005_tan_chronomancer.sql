-- Stage 7B: soft-delete for checklist items.
--
-- A checklist item that already has checklist_responses must never be hard
-- deleted — old checkout records join back to it for the item's label. Removing
-- such an item from a template instead sets active = false: it vanishes from
-- new checklists but stays readable in history. Items with no responses are
-- still hard deleted. Existing rows are all live, hence DEFAULT true NOT NULL.
ALTER TABLE "checklist_items" ADD COLUMN "active" boolean DEFAULT true NOT NULL;
