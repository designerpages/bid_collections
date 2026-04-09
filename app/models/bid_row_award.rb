class BidRowAward < ApplicationRecord
  belongs_to :bid_package
  belongs_to :spec_item
  belongs_to :bid

  validates :awarded_by, :awarded_at, presence: true
  validates :price_source, inclusion: { in: %w[bod alt] }
  validates :spec_item_id, uniqueness: { scope: :bid_package_id }
  validate :bid_belongs_to_package
  validate :spec_item_belongs_to_package

  private

  def bid_belongs_to_package
    return if bid.blank? || bid.invite.blank?
    return if bid.invite.bid_package_id == bid_package_id

    errors.add(:bid_id, 'must belong to the bid package')
  end

  def spec_item_belongs_to_package
    return if spec_item.blank?
    return if spec_item.bid_package_id == bid_package_id

    errors.add(:spec_item_id, 'must belong to the bid package')
  end
end
