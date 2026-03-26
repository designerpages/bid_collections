require_relative 'lib/bid_collections/version'

Gem::Specification.new do |spec|
  spec.name        = 'bid_collections'
  spec.version     = BidCollections::VERSION
  spec.authors     = ['Bid Collections Team']
  spec.email       = ['devnull@example.com']
  spec.summary     = 'Bid Collections Rails engine and API module.'
  spec.description = 'Mountable engine for bid collection workflows and API endpoints.'
  spec.homepage    = 'https://example.com/bid-collections'
  spec.license     = 'MIT'

  spec.files = Dir[
    'app/**/*',
    'config/**/*',
    'db/migrate/**/*',
    'lib/**/*',
    'LICENSE*',
    'README*'
  ]
  spec.require_paths = ['lib']

  spec.required_ruby_version = '>= 2.4.5'

  spec.add_dependency 'rails', '~> 5.2.8'
  spec.add_dependency 'mysql2', '= 0.5.3'
  spec.add_dependency 'puma', '~> 4.3'
  spec.add_dependency 'bcrypt', '~> 3.1'
  spec.add_dependency 'rack-cors'
  spec.add_dependency 'caxlsx', '~> 3.0'
end
