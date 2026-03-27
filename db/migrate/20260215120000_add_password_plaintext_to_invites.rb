class BidCollectionsAddPasswordPlaintextToInvites < ActiveRecord::Migration[5.2]
  def change
    add_column :invites, :password_plaintext, :string
  end
end

