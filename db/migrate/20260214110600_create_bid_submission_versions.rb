class BidCollectionsCreateBidSubmissionVersions < ActiveRecord::Migration[5.2]
  def change
    postgres = connection.adapter_name.downcase.include?('postgres')
    snapshot_column_type = postgres ? :jsonb : :json

    create_table :bid_submission_versions do |t|
      t.references :bid, null: false, foreign_key: true
      t.integer :version_number, null: false
      t.datetime :submitted_at, null: false
      t.decimal :total_amount, precision: 14, scale: 2
      if postgres
        t.public_send(snapshot_column_type, :line_items_snapshot, null: false, default: [])
      else
        # MySQL does not allow defaults on JSON columns.
        t.public_send(snapshot_column_type, :line_items_snapshot, null: false)
      end

      t.timestamps
    end

    add_index :bid_submission_versions, [:bid_id, :version_number], unique: true
    add_index :bid_submission_versions, [:bid_id, :submitted_at]
  end
end
