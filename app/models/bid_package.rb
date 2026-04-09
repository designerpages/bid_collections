class BidPackage < ApplicationRecord
  GENERAL_PRICING_FIELDS = %w[
    delivery_amount
    install_amount
    escalation_amount
    contingency_amount
    sales_tax_amount
  ].freeze

  belongs_to :project
  belongs_to :awarded_bid, class_name: 'Bid', optional: true
  has_many :spec_items, dependent: :destroy
  has_many :invites, dependent: :destroy
  has_many :bids, through: :invites
  has_many :bid_row_awards, dependent: :destroy
  has_many :bid_award_events, dependent: :destroy
  has_many :spec_item_approval_components, dependent: :destroy
  has_many :spec_item_requirement_approvals, dependent: :destroy
  has_many :post_award_uploads, dependent: :destroy

  enum visibility: { private: 0, public: 1 }, _prefix: true

  validates :name, :source_filename, :imported_at, presence: true

  before_validation :normalize_active_general_fields
  before_validation :normalize_custom_questions
  before_validation :normalize_excluded_spec_item_ids
  before_validation :ensure_public_token

  def active_general_fields
    configured = self[:active_general_fields]
    fields = configured.is_a?(Array) ? configured.map(&:to_s) : GENERAL_PRICING_FIELDS
    fields & GENERAL_PRICING_FIELDS
  end

  def active_general_field?(field_key)
    active_general_fields.include?(field_key.to_s)
  end

  def custom_questions
    raw = self[:custom_questions]
    Array(raw).each_with_object([]) do |question, memo|
      next unless question.is_a?(Hash)

      id = String(question['id'] || question[:id]).strip
      label = String(question['label'] || question[:label]).strip
      next if id.blank? || label.blank?

      memo << {
        'id' => id,
        'label' => label
      }
    end
  end

  def excluded_spec_item_ids
    raw = self[:excluded_spec_item_ids]
    Array(raw)
      .flat_map { |id| String(id).split(',') }
      .map { |id| id.to_i }
      .select(&:positive?)
      .uniq
  end

  def awarded?
    awarded_bid_id.present?
  end

  def award_committed?
    current_bid_row_awards_scope.exists?
  end

  def eligible_award_spec_item_ids
    scope = spec_items.active
    scope = scope.where.not(id: excluded_spec_item_ids) if excluded_spec_item_ids.any?
    scope.pluck(:id)
  end

  def awarded_row_count
    current_bid_row_awards_scope.count
  end

  def eligible_award_row_count
    eligible_award_spec_item_ids.length
  end

  def package_award_status
    eligible_count = eligible_award_row_count
    committed_count = awarded_row_count
    return 'not_awarded' if committed_count.zero? || eligible_count.zero?
    return 'fully_awarded' if committed_count >= eligible_count

    'partially_awarded'
  end

  def award_winner_scope
    bid_ids = current_bid_row_awards_scope.distinct.pluck(:bid_id)
    return 'none' if bid_ids.empty?
    return 'single_winner' if bid_ids.length == 1

    'multiple_winners'
  end

  def refresh_award_summary!
    current_awards = current_bid_row_awards_scope.to_a
    awarded_bid_ids = current_awards.map(&:bid_id).uniq
    eligible_count = eligible_award_row_count
    fully_awarded_single_winner = eligible_count.positive? && current_awards.length >= eligible_count && awarded_bid_ids.length == 1

    ActiveRecord::Base.transaction do
      bids.find_each do |bid|
        next_status =
          if awarded_bid_ids.include?(bid.id)
            :awarded
          elsif current_awards.any? && bid.submitted?
            :not_selected
          else
            :pending
          end
        bid.update_columns(selection_status: Bid.selection_statuses[next_status], updated_at: Time.current)
      end

      if fully_awarded_single_winner
        update_columns(
          awarded_bid_id: awarded_bid_ids.first,
          awarded_at: current_awards.map(&:awarded_at).compact.max,
          updated_at: Time.current
        )
      else
        update_columns(
          awarded_bid_id: nil,
          awarded_at: nil,
          updated_at: Time.current
        )
      end
    end
  end

  private

  def current_bid_row_awards_scope
    scope = bid_row_awards.joins(:spec_item).merge(spec_items.active)
    scope = scope.where.not(spec_item_id: excluded_spec_item_ids) if excluded_spec_item_ids.any?
    scope
  end

  def normalize_active_general_fields
    self[:active_general_fields] = self.class::GENERAL_PRICING_FIELDS if self[:active_general_fields].nil?
    self.active_general_fields = active_general_fields
  end

  def normalize_excluded_spec_item_ids
    self[:excluded_spec_item_ids] = excluded_spec_item_ids
  end

  def normalize_custom_questions
    self[:custom_questions] = custom_questions
  end

  def ensure_public_token
    self.public_token = SecureRandom.urlsafe_base64(18) if public_token.blank?
  end
end
