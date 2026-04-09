class Invite < ApplicationRecord
  self.table_name = 'bid_collection_invites'

  belongs_to :bid_package
  has_one :bid, dependent: :destroy
  has_many :bid_submission_versions, through: :bid
  has_many :post_award_uploads, dependent: :nullify

  has_secure_password
  has_secure_token :token

  before_validation :ensure_token

  validates :dealer_name, presence: true
  validates :token, presence: true, uniqueness: true

  scope :active, -> { where(disabled: false) }

  private

  def ensure_token
    self.token = SecureRandom.urlsafe_base64(18) if token.blank?
  end
end
