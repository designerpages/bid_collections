class BidLineItem < ApplicationRecord
  belongs_to :bid
  belongs_to :spec_item

  before_validation :normalize_lead_time_days

  validates :unit_price, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :quantity, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :discount_percent, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }, allow_nil: true
  validates :tariff_percent, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }, allow_nil: true
  validates :spec_item_id, uniqueness: { scope: [:bid_id, :is_substitution] }
  validates :unit_price, presence: true, if: :is_substitution?
  validate :lead_time_days_format

  def unit_net_price
    return nil if unit_price.nil?

    discount_multiplier = 1 - ((discount_percent || 0).to_d / 100)
    tariff_multiplier = 1 + ((tariff_percent || 0).to_d / 100)
    (unit_price * discount_multiplier * tariff_multiplier).round(4)
  end

  private

  def normalize_lead_time_days
    self.lead_time_days = lead_time_days.to_s.strip
    self.lead_time_days = nil if lead_time_days.blank?
  end

  def lead_time_days_format
    return if lead_time_days.blank?

    if /\A\d+\z/.match?(lead_time_days)
      return
    end

    range_match = /\A(\d+)\s*-\s*(\d+)\z/.match(lead_time_days)
    unless range_match
      errors.add(:lead_time_days, 'must be a whole number or range like 30-45')
      return
    end

    min_days = range_match[1].to_i
    max_days = range_match[2].to_i
    if min_days > max_days
      errors.add(:lead_time_days, 'range start cannot be greater than range end')
      return
    end

    self.lead_time_days = "#{min_days}-#{max_days}"
  end
end
