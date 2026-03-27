class BidCollectionsAddDisabledToInvites < ActiveRecord::Migration[5.2]
  def change
    add_column :invites, :disabled, :boolean, null: false, default: false
    add_index :invites, :disabled
  end
end
