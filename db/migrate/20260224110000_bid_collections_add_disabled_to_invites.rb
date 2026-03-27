class BidCollectionsAddDisabledToInvites < ActiveRecord::Migration[5.2]
  def change
    add_column :bid_collection_invites, :disabled, :boolean, null: false, default: false
    add_index :bid_collection_invites, :disabled
  end
end
