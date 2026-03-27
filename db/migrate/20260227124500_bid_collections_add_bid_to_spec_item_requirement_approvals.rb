class BidCollectionsAddBidToSpecItemRequirementApprovals < ActiveRecord::Migration[5.2]
  def change
    add_reference :spec_item_requirement_approvals, :bid, null: true, foreign_key: true

    remove_index :spec_item_requirement_approvals, name: 'idx_spec_req_approvals_unique'
    add_index :spec_item_requirement_approvals,
              [:spec_item_id, :requirement_key, :bid_id],
              unique: true,
              name: 'idx_spec_req_approvals_unique'
  end
end
