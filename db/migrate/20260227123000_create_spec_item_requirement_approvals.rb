class BidCollectionsCreateSpecItemRequirementApprovals < ActiveRecord::Migration[5.2]
  def change
    create_table :spec_item_requirement_approvals do |t|
      t.references :bid_package, null: false, foreign_key: true
      t.references :spec_item, null: false, foreign_key: true
      t.string :requirement_key, null: false
      t.datetime :approved_at, null: false
      t.string :approved_by

      t.timestamps
    end

    add_index :spec_item_requirement_approvals,
              [:spec_item_id, :requirement_key],
              unique: true,
              name: 'idx_spec_req_approvals_unique'
  end
end
