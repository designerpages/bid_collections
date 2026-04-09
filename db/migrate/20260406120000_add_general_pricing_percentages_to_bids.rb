class AddGeneralPricingPercentagesToBids < ActiveRecord::Migration[5.2]
  def change
    add_column :bids, :delivery_percent, :decimal, precision: 8, scale: 3
    add_column :bids, :install_percent, :decimal, precision: 8, scale: 3
    add_column :bids, :escalation_percent, :decimal, precision: 8, scale: 3
    add_column :bids, :contingency_percent, :decimal, precision: 8, scale: 3
    add_column :bids, :sales_tax_percent, :decimal, precision: 8, scale: 3
  end
end
