require 'net/http'
require 'json'
require 'openssl'
require 'securerandom'
require 'cgi'
require 'uri'

module Dp
  class ApiClient
    class Error < StandardError; end

    def initialize(
      base_url: (defined?(DP_API_BASE_URL) ? DP_API_BASE_URL : ENV['DP_API_BASE_URL']),
      shared_secret: (defined?(BC_SERVICE_SHARED_SECRET) ? BC_SERVICE_SHARED_SECRET : ENV['BC_SERVICE_SHARED_SECRET'])
    )
      @base_url = base_url.to_s.strip
      @shared_secret = shared_secret.to_s.strip
    end

    def configured?
      @base_url.present? && @shared_secret.present?
    end

    def context_resolve(firm_id:, project_name:, project_number: nil)
      post_json(
        '/api/v2/bid_collections/context',
        firm_id: firm_id,
        project_name: project_name,
        project_number: project_number
      )
    end

    # Embed / lightbox bootstrap: DP documents GET with firm_id + project_id.
    def context_resolve_by_project(firm_id:, project_id:)
      query = URI.encode_www_form('firm_id' => firm_id.to_s, 'project_id' => project_id.to_s)
      get_json("/api/v2/bid_collections/context?#{query}")
    end

    def list_bid_packages(project_id:)
      get_json("/api/v2/bid_collections/projects/#{escape_path(project_id)}/bid_packages")
    end

    def selection_resolve(project_id:, package_id:, requested_by: nil)
      post_json(
        "/api/v2/bid_collections/projects/#{escape_path(project_id)}/bid_packages/#{escape_path(package_id)}/selection",
        requested_by: requested_by
      )
    end

    def specs_batch(project_id:, project_product_ids:)
      post_json(
        "/api/v2/bid_collections/projects/#{escape_path(project_id)}/specs/batch",
        project_product_ids: project_product_ids
      )
    end

    private

    def escape_path(value)
      CGI.escape(value.to_s)
    end

    def uri_for(path)
      raise Error, 'DP_API_BASE_URL not configured' if @base_url.blank?
      URI.join(@base_url.end_with?('/') ? @base_url : "#{@base_url}/", path.sub(%r{^/+}, ''))
    end

    def get_json(path)
      request_json('GET', path, nil)
    end

    def post_json(path, payload)
      request_json('POST', path, payload.to_json)
    end

    def request_json(method, path, body_json)
      raise Error, 'BC_SERVICE_SHARED_SECRET not configured' if @shared_secret.blank?

      uri = uri_for(path)
      req = method == 'POST' ? Net::HTTP::Post.new(uri) : Net::HTTP::Get.new(uri)
      req['Accept'] = 'application/json'
      req['Content-Type'] = 'application/json' if method == 'POST'

      body = body_json.to_s
      req.body = body if method == 'POST'

      add_hmac_headers!(req, method: method, path: uri.request_uri, body: body)

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == 'https')
      res = http.request(req)

      parsed = begin
        JSON.parse(res.body.to_s)
      rescue StandardError
        nil
      end

      return parsed if res.code.to_i >= 200 && res.code.to_i < 300

      message = parsed.is_a?(Hash) ? (parsed['error'] || parsed['errors']&.join(', ')) : nil
      raise Error, (message.presence || "DP request failed: HTTP #{res.code}")
    end

    def add_hmac_headers!(req, method:, path:, body:)
      timestamp = Time.now.to_i.to_s
      nonce = SecureRandom.hex(12)
      body_sha256 = OpenSSL::Digest::SHA256.hexdigest(body.to_s)
      canonical = [timestamp, nonce, method.to_s.upcase, path.to_s, body_sha256].join('.')
      signature = OpenSSL::HMAC.hexdigest('SHA256', @shared_secret, canonical)

      req['X-BC-Timestamp'] = timestamp
      req['X-BC-Nonce'] = nonce
      req['X-BC-Signature'] = signature
    end
  end
end

