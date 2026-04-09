module Api
  module Admin
    class InvitesController < Api::BaseController
      before_action :load_bid_package

      def create
        invite = @bid_package.invites.new(invite_params)
        invite.password_plaintext = invite_params[:password]

        if invite.save
          render json: {
            invite: invite.slice(:id, :dealer_name, :dealer_email, :token, :created_at, :password_plaintext),
            invite_url: "/invite/#{invite.token}"
          }, status: :created
        else
          render_unprocessable!(invite.errors.full_messages)
        end
      end

      def destroy
        invite = @bid_package.invites.find(params[:id])
        invite.destroy!

        render json: { deleted: true, invite_id: invite.id }
      end

      def history
        invite = @bid_package.invites.includes(bid: :bid_submission_versions).find(params[:id])
        bid = invite.bid
        versions = (bid&.bid_submission_versions || []).order(version_number: :desc)

        render json: {
          invite_id: invite.id,
          dealer_name: invite.dealer_name,
          dealer_email: invite.dealer_email,
          current_version: versions.maximum(:version_number) || 0,
          versions: versions.map do |version|
            {
              id: version.id,
              version_number: version.version_number,
              submitted_at: version.submitted_at,
              total_amount: version.total_amount,
              line_items: version.line_items_snapshot
            }
          end
        }
      end

      def reopen
        invite = @bid_package.invites.includes(:bid).find(params[:id])
        bid = invite.bid

        unless bid&.submitted?
          return render json: { error: 'Only submitted bids can be reopened' }, status: :conflict
        end

        if bid_has_awarded_rows?(bid)
          return render json: {
            error: 'Cannot reopen this bidder because they have awarded rows. Reassign or clear those awards first.'
          }, status: :conflict
        end

        bid.update!(
          state: :draft,
          submitted_at: nil,
          last_reopened_at: Time.current,
          last_reopen_reason: params[:reason].to_s.strip.presence
        )

        render json: {
          reopened: true,
          state: bid.state,
          last_reopened_at: bid.last_reopened_at
        }
      end

      def reclose
        invite = @bid_package.invites.includes(bid: :bid_submission_versions).find(params[:id])
        bid = invite.bid

        unless bid
          return render json: { error: 'No bid exists for this invite' }, status: :conflict
        end

        latest_version = bid.bid_submission_versions.order(version_number: :desc).first
        unless latest_version
          return render json: { error: 'No submitted version to use' }, status: :conflict
        end

        ActiveRecord::Base.transaction do
          bid.update!(
            state: :submitted,
            submitted_at: latest_version.submitted_at || Time.current,
            last_reopen_reason: 'reclosed to submitted version'
          )
          invite.update!(disabled: true)
        end

        render json: {
          reclosed: true,
          invite_id: invite.id,
          state: bid.state,
          submitted_at: bid.submitted_at,
          access_state: 'disabled',
          current_version: latest_version.version_number
        }
      end

      def password
        invite = @bid_package.invites.find(params[:id])
        new_password = params[:password].to_s

        if new_password.blank?
          return render_unprocessable!('Password cannot be blank')
        end

        invite.update!(
          password: new_password,
          password_confirmation: new_password,
          password_plaintext: new_password
        )

        render json: { updated: true, invite_id: invite.id }
      rescue ActiveRecord::RecordInvalid => e
        render_unprocessable!(e.record.errors.full_messages)
      end

      def disable
        invite = @bid_package.invites.find(params[:id])
        invite.update!(disabled: true)
        render json: { disabled: true, invite_id: invite.id }
      end

      def enable
        invite = @bid_package.invites.find(params[:id])
        invite.update!(disabled: false)
        render json: { enabled: true, invite_id: invite.id }
      end

      def bulk_disable
        invites = scoped_bulk_invites
        return render_unprocessable!('Select at least one invite') if invites.empty?

        invites.update_all(disabled: true)
        render json: { disabled: true, invite_ids: invites.pluck(:id) }
      end

      def bulk_enable
        invites = scoped_bulk_invites
        return render_unprocessable!('Select at least one invite') if invites.empty?

        invites.update_all(disabled: false)
        render json: { enabled: true, invite_ids: invites.pluck(:id) }
      end

      def bulk_reopen
        invites = scoped_bulk_invites.includes(:bid)
        return render_unprocessable!('Select at least one invite') if invites.empty?

        reopened_ids = []
        skipped_ids = []

        invites.each do |invite|
          bid = invite.bid
          if bid&.submitted? && !bid_has_awarded_rows?(bid)
            bid.update!(
              state: :draft,
              submitted_at: nil,
              last_reopened_at: Time.current,
              last_reopen_reason: 'bulk reopen'
            )
            reopened_ids << invite.id
          else
            skipped_ids << invite.id
          end
        end

        render json: { reopened: true, reopened_ids: reopened_ids, skipped_ids: skipped_ids }
      end

      def bulk_destroy
        invites = scoped_bulk_invites
        return render_unprocessable!('Select at least one invite') if invites.empty?

        deleted_ids = []
        invites.find_each do |invite|
          deleted_ids << invite.id
          invite.destroy!
        end

        render json: { deleted: true, deleted_ids: deleted_ids }
      end

      private

      def load_bid_package
        @bid_package = BidPackage.find(params[:bid_package_id])
      end

      def invite_params
        params.require(:invite).permit(:dealer_name, :dealer_email, :password, :password_confirmation)
      end

      def scoped_bulk_invites
        ids = Array(params[:invite_ids]).map(&:to_i).uniq
        scope = @bid_package.invites
        ids.any? ? scope.where(id: ids) : scope.none
      end

      def bid_has_awarded_rows?(bid)
        return false unless bid

        scope = @bid_package.bid_row_awards
                            .where(bid_id: bid.id)
                            .joins(:spec_item)
                            .merge(@bid_package.spec_items.active)
        excluded_spec_item_ids = @bid_package.excluded_spec_item_ids
        scope = scope.where.not(spec_item_id: excluded_spec_item_ids) if excluded_spec_item_ids.any?
        scope.exists?
      end
    end
  end
end
