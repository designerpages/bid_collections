class BidCollectionsAddEscalationAndContingencyCompatibilityToBids < ActiveRecord::Migration[5.2]
  def up
    if column_exists?(:bids, :price_increase_amount) && !column_exists?(:bids, :escalation_amount)
      rename_column :bids, :price_increase_amount, :escalation_amount
    elsif !column_exists?(:bids, :escalation_amount)
      add_column :bids, :escalation_amount, :decimal, precision: 14, scale: 2
    end

    unless column_exists?(:bids, :contingency_amount)
      add_column :bids, :contingency_amount, :decimal, precision: 14, scale: 2
    end
  end

  def down
    remove_column :bids, :contingency_amount if column_exists?(:bids, :contingency_amount)

    if column_exists?(:bids, :escalation_amount) && !column_exists?(:bids, :price_increase_amount)
      rename_column :bids, :escalation_amount, :price_increase_amount
    end
  end
end
