module Api
  # Proxy endpoints for the Bid Collections frontend when DP endpoints
  # require HMAC service auth (browser cannot sign requests).
  #
  # These endpoints are intended for standalone BC mode:
  # - browser -> BC (no DP secrets)
  # - BC -> DP (HMAC-signed)
  class DpProxyController < Api::BaseController
    def context
      client = ::Dp::ApiClient.new
      payload = if request.get?
                  client.context_resolve_by_project(
                    firm_id: params.require(:firm_id),
                    project_id: params.require(:project_id)
                  )
                else
                  client.context_resolve(
                    firm_id: params.require(:firm_id),
                    project_name: params.require(:project_name),
                    project_number: params[:project_number]
                  )
                end
      render json: payload
    rescue ::Dp::ApiClient::Error => e
      render json: { error: e.message }, status: :bad_gateway
    end

    def bid_packages
      payload = ::Dp::ApiClient.new.list_bid_packages(project_id: params.require(:project_id))
      render json: payload
    rescue ::Dp::ApiClient::Error => e
      render json: { error: e.message }, status: :bad_gateway
    end

    def selection
      payload = ::Dp::ApiClient.new.selection_resolve(
        project_id: params.require(:project_id),
        package_id: params.require(:package_id),
        requested_by: params[:requested_by]
      )
      render json: payload
    rescue ::Dp::ApiClient::Error => e
      render json: { error: e.message }, status: :bad_gateway
    end

    def specs_batch
      payload = ::Dp::ApiClient.new.specs_batch(
        project_id: params.require(:project_id),
        project_product_ids: Array(params[:project_product_ids])
      )
      render json: payload
    rescue ::Dp::ApiClient::Error => e
      render json: { error: e.message }, status: :bad_gateway
    end
  end
end

