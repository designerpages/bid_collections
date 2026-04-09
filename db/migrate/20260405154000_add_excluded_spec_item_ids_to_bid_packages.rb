class AddExcludedSpecItemIdsToBidPackages < ActiveRecord::Migration[5.2]
  def change
    add_column :bid_packages, :excluded_spec_item_ids, :json unless column_exists?(:bid_packages, :excluded_spec_item_ids)

    default_json = ActiveRecord::Base.connection.quote([].to_json)
    execute <<~SQL.squish
      UPDATE bid_packages
      SET excluded_spec_item_ids = #{default_json}
      WHERE excluded_spec_item_ids IS NULL
    SQL

    change_column_null :bid_packages, :excluded_spec_item_ids, false
  end
end
