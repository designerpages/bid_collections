class BidCollectionsCreateSpecItemApprovalComponents < ActiveRecord::Migration[5.2]
  def change
    create_table :spec_item_approval_components do |t|
      t.references :bid_package, null: false, foreign_key: true
      t.references :spec_item, null: false, foreign_key: true
      t.string :label, null: false
      t.integer :position, null: false, default: 0
      t.timestamps
    end

    add_reference :spec_item_requirement_approvals, :component, foreign_key: { to_table: :spec_item_approval_components }

    remove_index :spec_item_requirement_approvals, name: 'idx_spec_req_approvals_unique'
    add_index :spec_item_requirement_approvals,
              [:spec_item_id, :requirement_key, :bid_id, :component_id],
              unique: true,
              name: 'idx_spec_req_approvals_unique'
  end
end
