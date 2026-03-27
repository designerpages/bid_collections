class BidCollectionsAddSettingsToBidPackages < ActiveRecord::Migration[5.2]
  DEFAULT_GENERAL_FIELDS = %w[
    delivery_amount
    install_amount
    escalation_amount
    contingency_amount
    sales_tax_amount
  ].freeze

  def up
    add_column :bid_packages, :visibility, :integer, null: false, default: 0 unless column_exists?(:bid_packages, :visibility)
    add_column :bid_packages, :active_general_fields, :json unless column_exists?(:bid_packages, :active_general_fields)
    add_column :bid_packages, :public_token, :string unless column_exists?(:bid_packages, :public_token)

    default_json = connection.quote(DEFAULT_GENERAL_FIELDS.to_json)
    execute <<~SQL
      UPDATE bid_packages
      SET active_general_fields = #{default_json}
      WHERE active_general_fields IS NULL
    SQL

    change_column_null :bid_packages, :active_general_fields, false
    add_index :bid_packages, :public_token, unique: true unless index_exists?(:bid_packages, :public_token)
  end

  def down
    remove_index :bid_packages, :public_token if index_exists?(:bid_packages, :public_token)
    remove_column :bid_packages, :public_token if column_exists?(:bid_packages, :public_token)
    remove_column :bid_packages, :active_general_fields if column_exists?(:bid_packages, :active_general_fields)
    remove_column :bid_packages, :visibility if column_exists?(:bid_packages, :visibility)
  end
end
