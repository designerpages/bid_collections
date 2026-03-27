class BidCollectionsCreateInvites < ActiveRecord::Migration[5.2]
  def change
    create_table :invites do |t|
      t.references :bid_package, null: false, foreign_key: true
      t.string :dealer_name, null: false
      t.string :dealer_email
      t.string :token, null: false
      t.string :password_digest, null: false
      t.datetime :last_unlocked_at

      t.timestamps
    end

    add_index :invites, :token, unique: true
    add_index :invites, [:bid_package_id, :dealer_name]
  end
end
