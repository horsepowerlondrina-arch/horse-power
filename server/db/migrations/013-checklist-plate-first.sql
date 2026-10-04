ALTER TABLE checklist_photos RENAME TO checklist_photos_old;
ALTER TABLE checklists RENAME TO checklists_old;

CREATE TABLE checklists (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 order_id TEXT,
 customer_id TEXT,
 vehicle_id TEXT,
 customer_name TEXT NOT NULL DEFAULT '',
 phone TEXT NOT NULL DEFAULT '',
 plate TEXT NOT NULL,
 vehicle_label TEXT NOT NULL DEFAULT '',
 km INTEGER NOT NULL DEFAULT 0 CHECK(km>=0),
 fuel_level INTEGER NOT NULL DEFAULT 0 CHECK(fuel_level BETWEEN 0 AND 100),
 inspector TEXT NOT NULL DEFAULT '',
 complaint TEXT NOT NULL DEFAULT '',
 conditions_json TEXT NOT NULL DEFAULT '{}',
 accessories_notes TEXT NOT NULL DEFAULT '',
 panel_json TEXT NOT NULL DEFAULT '{}',
 panel_notes TEXT NOT NULL DEFAULT '',
 objects_left TEXT NOT NULL DEFAULT '',
 functioning_notes TEXT NOT NULL DEFAULT '',
 damages_json TEXT NOT NULL DEFAULT '[]',
 damage_notes TEXT NOT NULL DEFAULT '',
 signature_data TEXT NOT NULL DEFAULT '',
 signature_absent_reason TEXT NOT NULL DEFAULT '',
 customer_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(customer_confirmed IN (0,1)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT,
 lookup_source TEXT NOT NULL DEFAULT '',
 vehicle_data_json TEXT NOT NULL DEFAULT '{}',
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,order_id) REFERENCES orders(tenant_id,id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id),
 FOREIGN KEY(tenant_id,vehicle_id) REFERENCES vehicles(tenant_id,id)
);

INSERT INTO checklists(
 id,tenant_id,order_id,customer_id,vehicle_id,customer_name,phone,plate,vehicle_label,
 km,fuel_level,inspector,complaint,conditions_json,accessories_notes,panel_json,panel_notes,
 objects_left,functioning_notes,damages_json,damage_notes,signature_data,
 signature_absent_reason,customer_confirmed,status,created_at,updated_at,completed_at,
 lookup_source,vehicle_data_json
)
SELECT
 id,tenant_id,order_id,customer_id,vehicle_id,customer_name,phone,plate,vehicle_label,
 km,fuel_level,inspector,complaint,conditions_json,accessories_notes,panel_json,panel_notes,
 objects_left,functioning_notes,damages_json,damage_notes,signature_data,
 signature_absent_reason,customer_confirmed,status,created_at,updated_at,completed_at,
 CASE WHEN vehicle_id IS NOT NULL THEN 'local' ELSE '' END,
 '{}'
FROM checklists_old;

CREATE TABLE checklist_photos (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 checklist_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 mime TEXT NOT NULL,
 image_data TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,checklist_id) REFERENCES checklists(tenant_id,id) ON DELETE CASCADE
);

INSERT INTO checklist_photos(id,tenant_id,checklist_id,kind,mime,image_data,created_at)
SELECT id,tenant_id,checklist_id,kind,mime,image_data,created_at
FROM checklist_photos_old;

DROP TABLE checklist_photos_old;
DROP TABLE checklists_old;

CREATE INDEX idx_checklists_tenant_plate ON checklists(tenant_id,plate,created_at);
CREATE INDEX idx_checklists_order ON checklists(tenant_id,order_id,created_at);
CREATE INDEX idx_checklist_photos_checklist ON checklist_photos(tenant_id,checklist_id,created_at);

INSERT INTO migrations(version) VALUES(13);
