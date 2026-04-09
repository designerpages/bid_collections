class Bid < ApplicationRecord
  GENERAL_PRICING_PERCENT_COLUMNS = {
    'delivery_amount' => 'delivery_percent',
    'install_amount' => 'install_percent',
    'escalation_amount' => 'escalation_percent',
    'contingency_amount' => 'contingency_percent',
    'sales_tax_amount' => 'sales_tax_percent'
  }.freeze

  belongs_to :invite
  has_one :bid_package, through: :invite
  has_many :bid_line_items, dependent: :destroy
  has_many :bid_row_awards, dependent: :destroy
  has_many :bid_submission_versions, dependent: :destroy

  enum state: { draft: 0, submitted: 1 }
  enum selection_status: { pending: 0, not_selected: 1, awarded: 2 }

  validates :state, presence: true
  validates :delivery_amount, :install_amount, :escalation_amount, :contingency_amount, :sales_tax_amount,
            numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :delivery_percent, :install_percent, :escalation_percent, :contingency_percent, :sales_tax_percent,
            numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }, allow_nil: true

  before_validation :normalize_custom_question_responses
  before_update :prevent_edit_after_submit

  def custom_question_responses
    raw = self[:custom_question_responses]
    return {} unless raw.is_a?(Hash)

    raw.each_with_object({}) do |(key, value), memo|
      normalized_key = String(key).strip
      next if normalized_key.blank?

      memo[normalized_key] = String(value || '').strip
    end
  end

  def create_submission_version!
    items = bid_line_items.includes(:spec_item).map do |line_item|
      spec_item = line_item.spec_item
      display_product_name = line_item.is_substitution? ? (line_item.substitution_product_name.presence || spec_item.product_name) : spec_item.product_name
      display_brand_name = line_item.is_substitution? ? (line_item.substitution_brand_name.presence || spec_item.manufacturer) : spec_item.manufacturer

      {
        spec_item_id: spec_item.id,
        code_tag: spec_item.sku,
        product_name: display_product_name,
        brand_name: display_brand_name,
        quantity: line_item_quantity(line_item, spec_item)&.to_s,
        uom: spec_item.uom,
        is_substitution: line_item.is_substitution?,
        unit_list_price: line_item.unit_price&.to_s,
        discount_percent: line_item.discount_percent&.to_s,
        tariff_percent: line_item.tariff_percent&.to_s,
        unit_net_price: line_item.unit_net_price&.to_s,
        extended_price: begin
          quantity = line_item_quantity(line_item, spec_item)
          line_item.unit_net_price && quantity.present? ? (quantity * line_item.unit_net_price).round(4).to_s : nil
        end,
        unit_price: line_item.unit_price&.to_s,
        lead_time_days: line_item.lead_time_days,
        dealer_notes: line_item.dealer_notes
      }
    end

    subtotal = items.sum { |row| row[:extended_price].present? ? BigDecimal(row[:extended_price]) : 0 }
    total = subtotal + active_general_pricing_total(subtotal: subtotal)

    bid_submission_versions.create!(
      version_number: (bid_submission_versions.maximum(:version_number) || 0) + 1,
      submitted_at: submitted_at || Time.current,
      total_amount: total,
      line_items_snapshot: items
    )
  end

  def general_pricing_percent_for(field_key)
    column = GENERAL_PRICING_PERCENT_COLUMNS[field_key.to_s]
    return nil if column.blank?

    self[column]
  end

  def general_pricing_amount_for(field_key, subtotal:)
    field = field_key.to_s
    percent = general_pricing_percent_for(field)
    return ((subtotal || 0).to_d * percent.to_d / 100).round(2) if percent.present?

    (self[field] || 0).to_d
  end

  def general_pricing_amounts(subtotal:)
    BidPackage::GENERAL_PRICING_FIELDS.each_with_object({}) do |field, memo|
      memo[field] = general_pricing_amount_for(field, subtotal: subtotal)
    end
  end

  def active_general_pricing_total(subtotal: 0)
    fields = invite&.bid_package&.active_general_fields || BidPackage::GENERAL_PRICING_FIELDS
    total = 0.to_d
    total += general_pricing_amount_for('delivery_amount', subtotal: subtotal) if fields.include?('delivery_amount')
    total += general_pricing_amount_for('install_amount', subtotal: subtotal) if fields.include?('install_amount')
    total += general_pricing_amount_for('escalation_amount', subtotal: subtotal) if fields.include?('escalation_amount')
    total += general_pricing_amount_for('contingency_amount', subtotal: subtotal) if fields.include?('contingency_amount')
    total += general_pricing_amount_for('sales_tax_amount', subtotal: subtotal) if fields.include?('sales_tax_amount')
    total
  end

  def latest_total_amount
    latest_submitted_total = bid_submission_versions.order(version_number: :desc).limit(1).pick(:total_amount)
    return latest_submitted_total.to_d if latest_submitted_total.present?

    subtotal = bid_line_items.includes(:spec_item).sum do |line_item|
      quantity = line_item_quantity(line_item, line_item.spec_item)
      unit_net = line_item.unit_net_price
      quantity && unit_net ? quantity * unit_net : 0
    end

    subtotal.to_d + active_general_pricing_total(subtotal: subtotal)
  end

  private

  def normalize_custom_question_responses
    self[:custom_question_responses] = custom_question_responses
  end

  def prevent_edit_after_submit
    return unless submitted? && state_in_database == 'submitted'
    return if (changes_to_save.keys - %w[selection_status updated_at]).empty?

    errors.add(:base, 'Submitted bids are locked and cannot be edited')
    throw(:abort)
  end

  def line_item_quantity(line_item, spec_item)
    line_item&.quantity || spec_item&.quantity
  end
end
