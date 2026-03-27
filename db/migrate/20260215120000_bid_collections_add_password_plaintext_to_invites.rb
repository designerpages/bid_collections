class BidCollectionsAddPasswordPlaintextToInvites < ActiveRecord::Migration[5.2]
  def change
    add_column :bid_collection_invites, :password_plaintext, :string
  end
end

