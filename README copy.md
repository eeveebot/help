# urltitle Module

Automatically fetches and displays titles for URLs posted in chat messages.

## Functionality

The urltitle module listens to all incoming chat messages and automatically extracts any URLs found in the text. For each URL detected, it fetches the webpage and extracts the title tag, then posts the title back to the channel in the format `[Title Text]`.

The module supports:
- Standard HTML title tags
- OpenGraph title meta tags (as fallback)
- Configurable user agent and timeout settings
- Automatic handling of redirects (up to 5 levels)

## Configuration

The module can be configured through the `config.yaml` file:

```yaml
# Optional: Custom user agent for HTTP requests
userAgent: "Custom Bot Name 1.0"

# Optional: Timeout for HTTP requests in milliseconds
timeout: 5000
```

## Special Domain Handling

While the current implementation handles all URLs uniformly, future enhancements will add special handling for specific domains like YouTube, Twitter, etc.

## Usage

Simply post any URL in a channel where the bot is active, and it will automatically respond with the page title:

```
<User> Check this out: https://example.com/some-page
<Bot> [Example Domain]
```

## Technical Details

- Listens to `chat.message.incoming.>` NATS topic
- Publishes responses to `chat.message.outgoing.$PLATFORM.$INSTANCE.$CHANNEL`
- Built with Node.js, TypeScript, axios, and cheerio