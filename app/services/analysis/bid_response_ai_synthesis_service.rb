require 'json'
require 'net/http'

module Analysis
  class BidResponseAiSynthesisService
    OPENAI_URI = URI.parse('https://api.openai.com/v1/chat/completions')

    def initialize(bid_package:, deterministic_payload:, model: nil)
      @bid_package = bid_package
      @deterministic_payload = deterministic_payload || {}
      @model = model.presence || ENV['OPENAI_BID_ANALYSIS_MODEL'].presence || 'gpt-4o-mini'
    end

    def call
      api_key = ENV['OPENAI_API_KEY'].to_s.strip
      return { error: 'OPENAI_API_KEY is not configured' } if api_key.empty?

      request_body = {
        model: @model,
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are implementing a concise bid-analysis tool, not a report generator and not a recommendation engine. Return strict JSON only with keys: title, leader, leader_review, high_variance_rows, follow_up. Keep language plain and direct. No speculation, no award recommendation, no accusation. High-Variance Rows must be code tags only.'
          },
          {
            role: 'user',
            content: build_user_prompt
          }
        ]
      }

      response_json = post_to_openai(api_key: api_key, body: request_body)
      content = response_json.dig('choices', 0, 'message', 'content').to_s
      parsed = JSON.parse(content)

      {
        source: 'ai',
        model: @model,
        title: normalize_text(parsed['title'], fallback: '🧠 Bid Analysis'),
        leader: normalize_lines(parsed['leader'], min: 1, max: 2),
        leader_review: normalize_lines(parsed['leader_review'], min: 1, max: 2),
        high_variance_rows: normalize_lines(parsed['high_variance_rows'], min: 1, max: 2),
        follow_up: normalize_lines(parsed['follow_up'], min: 1, max: 3)
      }
    rescue StandardError => error
      { error: "AI synthesis failed: #{error.message}" }
    end

    private

    def build_user_prompt
      analysis = @deterministic_payload.is_a?(Hash) ? @deterministic_payload : {}
      {
        objective: 'Write a concise, neutral bid-review memo. No award recommendation.',
        output_schema: {
          title: 'string',
          leader: ['string'],
          leader_review: ['string'],
          high_variance_rows: ['string'],
          follow_up: ['string']
        },
        package: {
          bid_package_id: @bid_package.id,
          name: @bid_package.name
        },
        analysis_meta: analysis['meta'] || analysis[:meta] || {},
        spread_context: analysis['spreadContext'] || analysis[:spreadContext] || {},
        winner: analysis['winner'] || analysis[:winner] || {},
        title: analysis['title'] || analysis[:title],
        flagged_row_count: analysis['flagged_row_count'] || analysis[:flagged_row_count],
        priority_row_count: analysis['priority_row_count'] || analysis[:priority_row_count],
        priority_rows: analysis['priority_rows'] || analysis[:priority_rows] || [],
        leader: analysis['leader'] || analysis[:leader] || [],
        leader_review: analysis['leader_review'] || analysis[:leader_review] || [],
        high_variance_rows: analysis['high_variance_rows'] || analysis[:high_variance_rows] || [],
        follow_up: analysis['follow_up'] || analysis[:follow_up] || [],
        top_anomalies: Array(analysis['topAnomalies'] || analysis[:topAnomalies]).first(10).map do |row|
          {
            code_tag: row['codeTag'] || row[:codeTag],
            spread_pct: row['spreadPct'] || row[:spreadPct],
            spread_vs_median: row['spreadVsMedian'] || row[:spreadVsMedian],
            impact: row['impact'] || row[:impact],
            reason: row['reason'] || row[:reason]
          }
        end,
        winner_audit_rows: Array(analysis['winnerAuditRows'] || analysis[:winnerAuditRows]).first(10).map do |row|
          {
            code_tag: row['codeTag'] || row[:codeTag],
            spread_pct: row['spreadPct'] || row[:spreadPct],
            spread_vs_median: row['spreadVsMedian'] || row[:spreadVsMedian],
            impact: row['impact'] || row[:impact],
            reason: row['reason'] || row[:reason]
          }
        end,
        rules: [
          'Output format is strict: title, leader, leader_review, high_variance_rows, follow_up',
          'Do not add any extra sections or fields',
          'Leader section: 1-2 lines max',
          'Leader Review section: 1-2 lines max or explicitly state nothing stands out',
          'When rows are flagged, include one guidance line in Leader Review: "Look for: scope, quantity, or component differences"',
          'In Leader Review, do not surface large flagged counts; emphasize that a small number of rows stand out and list priority row codes',
          'High-Variance Rows must list only row codes (no metrics, no reasons, no explanatory text)',
          'Follow Up section: 1-3 concise action bullets',
          'No percentile or distribution language in memo text',
          'No speculation words like likely, suggests, appears',
          'No award recommendation and no claim that bids are wrong',
          'Keep anomaly details out of the main list; those are shown on hover in UI',
          'Use plain language and keep each line actionable',
          'When many rows are flagged, distinguish flagged_row_count vs priority_row_count',
          'Keep total content tight; this should read like a tool output, not a memo report'
        ]
      }.to_json
    end

    def post_to_openai(api_key:, body:)
      http = Net::HTTP.new(OPENAI_URI.host, OPENAI_URI.port)
      http.use_ssl = true
      http.read_timeout = 60

      request = Net::HTTP::Post.new(OPENAI_URI.request_uri)
      request['Authorization'] = "Bearer #{api_key}"
      request['Content-Type'] = 'application/json'
      request.body = body.to_json

      response = http.request(request)
      parsed = JSON.parse(response.body)
      unless response.code.to_i.between?(200, 299)
        raise parsed['error'].is_a?(Hash) ? parsed['error']['message'].to_s : "HTTP #{response.code}"
      end
      parsed
    end

    def normalize_lines(value, min:, max:)
      lines = Array(value).map { |line| line.to_s.strip }.reject(&:empty?).first(max)
      return lines if lines.length >= min

      lines
    end

    def normalize_text(value, fallback:)
      text = value.to_s.strip
      text.present? ? text : fallback
    end
  end
end
