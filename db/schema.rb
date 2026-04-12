# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# Note that this schema.rb definition is the authoritative source for your
# database schema. If you need to create the application database on another
# system, you should be using db:schema:load, not running all the migrations
# from scratch. The latter is a flawed and unsustainable approach (the more migrations
# you'll amass, the slower it'll run and the greater likelihood for issues).
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema.define(version: 2026_04_09_121000) do

  create_table "bid_award_events", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_package_id", null: false
    t.bigint "from_bid_id"
    t.bigint "to_bid_id", null: false
    t.integer "event_type", null: false
    t.decimal "awarded_amount_snapshot", precision: 14, scale: 2, null: false
    t.string "awarded_by", null: false
    t.text "note"
    t.datetime "awarded_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.json "comparison_snapshot"
    t.index ["bid_package_id", "awarded_at"], name: "index_bid_award_events_on_bid_package_id_and_awarded_at"
    t.index ["bid_package_id"], name: "index_bid_award_events_on_bid_package_id"
    t.index ["event_type"], name: "index_bid_award_events_on_event_type"
    t.index ["from_bid_id"], name: "index_bid_award_events_on_from_bid_id"
    t.index ["to_bid_id"], name: "index_bid_award_events_on_to_bid_id"
  end

  create_table "bid_collection_invites", id: :integer, options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_package_id", null: false
    t.string "dealer_name", null: false
    t.string "dealer_email"
    t.string "token", null: false
    t.string "password_digest", null: false
    t.datetime "last_unlocked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "password_plaintext"
    t.boolean "disabled", default: false, null: false
    t.index ["bid_package_id", "dealer_name"], name: "index_bid_collection_invites_on_bid_package_id_and_dealer_name"
    t.index ["bid_package_id"], name: "index_bid_collection_invites_on_bid_package_id"
    t.index ["disabled"], name: "index_bid_collection_invites_on_disabled"
    t.index ["token"], name: "index_bid_collection_invites_on_token", unique: true
  end

  create_table "bid_line_items", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_id", null: false
    t.bigint "spec_item_id", null: false
    t.decimal "unit_price", precision: 12, scale: 4
    t.string "lead_time_days"
    t.text "dealer_notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.decimal "discount_percent", precision: 6, scale: 3
    t.decimal "tariff_percent", precision: 6, scale: 3
    t.boolean "is_substitution", default: false, null: false
    t.string "substitution_product_name"
    t.string "substitution_brand_name"
    t.decimal "quantity", precision: 12, scale: 3
    t.index ["bid_id", "spec_item_id", "is_substitution"], name: "index_bid_line_items_on_bid_spec_substitution", unique: true
    t.index ["bid_id"], name: "index_bid_line_items_on_bid_id"
    t.index ["spec_item_id", "unit_price"], name: "index_bid_line_items_on_spec_item_id_and_unit_price"
    t.index ["spec_item_id"], name: "index_bid_line_items_on_spec_item_id"
  end

  create_table "bid_packages", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.integer "project_id", null: false
    t.string "name", null: false
    t.string "source_filename", null: false
    t.datetime "imported_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "visibility", default: 0, null: false
    t.json "active_general_fields", null: false
    t.string "public_token"
    t.text "instructions"
    t.bigint "awarded_bid_id"
    t.datetime "awarded_at"
    t.json "excluded_spec_item_ids", null: false
    t.json "custom_questions"
    t.index ["awarded_bid_id"], name: "index_bid_packages_on_awarded_bid_id"
    t.index ["project_id", "created_at"], name: "index_bid_packages_on_project_id_and_created_at"
    t.index ["project_id"], name: "index_bid_packages_on_project_id"
    t.index ["public_token"], name: "index_bid_packages_on_public_token", unique: true
  end

  create_table "bid_row_awards", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_package_id", null: false
    t.bigint "spec_item_id", null: false
    t.bigint "bid_id", null: false
    t.string "price_source", default: "bod", null: false
    t.decimal "unit_price_snapshot", precision: 12, scale: 4
    t.decimal "extended_price_snapshot", precision: 14, scale: 2
    t.string "awarded_by", null: false
    t.datetime "awarded_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["bid_id"], name: "index_bid_row_awards_on_bid_id"
    t.index ["bid_package_id", "spec_item_id"], name: "idx_bid_row_awards_unique", unique: true
    t.index ["spec_item_id"], name: "fk_rails_b452db77af"
  end

  create_table "bid_submission_versions", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_id", null: false
    t.integer "version_number", null: false
    t.datetime "submitted_at", null: false
    t.decimal "total_amount", precision: 14, scale: 2
    t.json "line_items_snapshot", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["bid_id", "submitted_at"], name: "index_bid_submission_versions_on_bid_id_and_submitted_at"
    t.index ["bid_id", "version_number"], name: "index_bid_submission_versions_on_bid_id_and_version_number", unique: true
    t.index ["bid_id"], name: "index_bid_submission_versions_on_bid_id"
  end

  create_table "bids", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.integer "invite_id", null: false
    t.integer "state", default: 0, null: false
    t.datetime "submitted_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "last_reopened_at"
    t.string "last_reopen_reason"
    t.decimal "delivery_amount", precision: 14, scale: 2
    t.decimal "install_amount", precision: 14, scale: 2
    t.decimal "escalation_amount", precision: 14, scale: 2
    t.decimal "contingency_amount", precision: 14, scale: 2
    t.decimal "sales_tax_amount", precision: 14, scale: 2
    t.integer "selection_status", default: 0, null: false
    t.decimal "delivery_percent", precision: 8, scale: 3
    t.decimal "install_percent", precision: 8, scale: 3
    t.decimal "escalation_percent", precision: 8, scale: 3
    t.decimal "contingency_percent", precision: 8, scale: 3
    t.decimal "sales_tax_percent", precision: 8, scale: 3
    t.json "custom_question_responses"
    t.index ["invite_id"], name: "index_bids_on_invite_id", unique: true
    t.index ["selection_status"], name: "index_bids_on_selection_status"
    t.index ["state"], name: "index_bids_on_state"
  end

  create_table "dp_spec_cache_entries", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.integer "project_id", null: false
    t.string "project_product_id", null: false
    t.json "payload", null: false
    t.datetime "fetched_at", null: false
    t.datetime "expires_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expires_at"], name: "index_dp_spec_cache_entries_on_expires_at"
    t.index ["project_id", "project_product_id"], name: "idx_dp_spec_cache_unique", unique: true
    t.index ["project_id"], name: "index_dp_spec_cache_entries_on_project_id"
  end

  create_table "dp_sync_requests", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.string "sync_id", null: false
    t.integer "status", default: 0, null: false
    t.integer "project_id", null: false
    t.bigint "bid_package_id", null: false
    t.string "idempotency_key", null: false
    t.string "requested_by"
    t.json "received_ids", null: false
    t.integer "resolved_count", default: 0, null: false
    t.integer "missing_count", default: 0, null: false
    t.json "missing_ids"
    t.json "errors_json"
    t.datetime "started_at"
    t.datetime "finished_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["bid_package_id"], name: "index_dp_sync_requests_on_bid_package_id"
    t.index ["idempotency_key"], name: "index_dp_sync_requests_on_idempotency_key", unique: true
    t.index ["project_id"], name: "index_dp_sync_requests_on_project_id"
    t.index ["sync_id"], name: "index_dp_sync_requests_on_sync_id", unique: true
  end

  create_table "post_award_uploads", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_package_id", null: false
    t.bigint "spec_item_id"
    t.integer "invite_id"
    t.integer "uploader_role", default: 0, null: false
    t.string "file_name", null: false
    t.text "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "storage_path"
    t.string "content_type"
    t.bigint "byte_size"
    t.string "requirement_key"
    t.index ["bid_package_id", "spec_item_id", "created_at"], name: "idx_post_award_uploads_lookup"
    t.index ["bid_package_id", "spec_item_id", "requirement_key"], name: "idx_post_award_uploads_requirement"
    t.index ["bid_package_id"], name: "index_post_award_uploads_on_bid_package_id"
    t.index ["invite_id"], name: "index_post_award_uploads_on_invite_id"
    t.index ["spec_item_id"], name: "index_post_award_uploads_on_spec_item_id"
  end

  create_table "projects", id: :integer, options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "firm_id"
    t.string "dp_project_id"
    t.index ["dp_project_id"], name: "index_projects_on_dp_project_id", unique: true
    t.index ["firm_id"], name: "index_projects_on_firm_id"
  end

  create_table "spec_item_approval_components", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_package_id", null: false
    t.bigint "spec_item_id", null: false
    t.string "label", null: false
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["bid_package_id"], name: "index_spec_item_approval_components_on_bid_package_id"
    t.index ["spec_item_id"], name: "index_spec_item_approval_components_on_spec_item_id"
  end

  create_table "spec_item_requirement_approvals", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_package_id", null: false
    t.bigint "spec_item_id", null: false
    t.string "requirement_key", null: false
    t.datetime "approved_at"
    t.string "approved_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "bid_id"
    t.integer "status", default: 0, null: false
    t.json "needs_fix_dates", null: false
    t.json "action_history", null: false
    t.bigint "component_id"
    t.index ["bid_id"], name: "index_spec_item_requirement_approvals_on_bid_id"
    t.index ["bid_package_id"], name: "index_spec_item_requirement_approvals_on_bid_package_id"
    t.index ["component_id"], name: "index_spec_item_requirement_approvals_on_component_id"
    t.index ["spec_item_id", "requirement_key", "bid_id", "component_id"], name: "idx_spec_req_approvals_unique", unique: true
    t.index ["spec_item_id"], name: "index_spec_item_requirement_approvals_on_spec_item_id"
  end

  create_table "spec_items", options: "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci", force: :cascade do |t|
    t.bigint "bid_package_id", null: false
    t.string "spec_item_id", null: false
    t.string "category", null: false
    t.string "manufacturer", null: false
    t.string "product_name", null: false
    t.string "sku", null: false
    t.text "description", null: false
    t.decimal "quantity", precision: 12, scale: 3
    t.string "uom", null: false
    t.string "finish"
    t.string "color"
    t.string "location"
    t.string "dimensions"
    t.string "link"
    t.string "image_url"
    t.string "source_url"
    t.text "attributes_text"
    t.text "nested_products"
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "active", default: true, null: false
    t.index ["bid_package_id", "active"], name: "index_spec_items_on_bid_package_id_and_active"
    t.index ["bid_package_id", "sku"], name: "index_spec_items_on_bid_package_id_and_sku"
    t.index ["bid_package_id", "spec_item_id"], name: "index_spec_items_on_bid_package_id_and_spec_item_id", unique: true
    t.index ["bid_package_id"], name: "index_spec_items_on_bid_package_id"
  end

  add_foreign_key "bid_award_events", "bid_packages"
  add_foreign_key "bid_award_events", "bids", column: "from_bid_id"
  add_foreign_key "bid_award_events", "bids", column: "to_bid_id"
  add_foreign_key "bid_collection_invites", "bid_packages"
  add_foreign_key "bid_line_items", "bids"
  add_foreign_key "bid_line_items", "spec_items"
  add_foreign_key "bid_packages", "bids", column: "awarded_bid_id"
  add_foreign_key "bid_packages", "projects"
  add_foreign_key "bid_row_awards", "bid_packages"
  add_foreign_key "bid_row_awards", "bids"
  add_foreign_key "bid_row_awards", "spec_items"
  add_foreign_key "bid_submission_versions", "bids"
  add_foreign_key "bids", "bid_collection_invites", column: "invite_id"
  add_foreign_key "dp_spec_cache_entries", "projects"
  add_foreign_key "dp_sync_requests", "bid_packages"
  add_foreign_key "dp_sync_requests", "projects"
  add_foreign_key "post_award_uploads", "bid_collection_invites", column: "invite_id"
  add_foreign_key "post_award_uploads", "bid_packages"
  add_foreign_key "post_award_uploads", "spec_items"
  add_foreign_key "spec_item_approval_components", "bid_packages"
  add_foreign_key "spec_item_approval_components", "spec_items"
  add_foreign_key "spec_item_requirement_approvals", "bid_packages"
  add_foreign_key "spec_item_requirement_approvals", "bids"
  add_foreign_key "spec_item_requirement_approvals", "spec_item_approval_components", column: "component_id"
  add_foreign_key "spec_item_requirement_approvals", "spec_items"
  add_foreign_key "spec_items", "bid_packages"
end
