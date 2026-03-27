# BookLab MCP Server

Curated nonfiction book recommendations for AI agents via the [Model Context Protocol](https://modelcontextprotocol.io).

## Quick Start

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "booklab": {
      "command": "node",
      "args": ["/path/to/booklab-agents/server.js"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `recommend` | Get ranked book recommendations by describing a situation, question, or topic |
| `book_profile` | Get the full structured profile of a specific book |
| `list_books` | List all books in the curated library |

## Resource

- `booklab://library` — Full library as JSON

## Library

21 curated nonfiction books (all 5/5 rated), covering philosophy, psychology, history, economics, and human nature.

## How It Works

The server uses TF-IDF scoring with concept expansion (synonym maps for 17 concept families) to match natural language queries against structured book profiles. Each profile includes themes, tags, key insights, emotional tone, worldview, difficulty rating, and connections to other books.

## Built By

[BookLab by Bjorn](https://booklabbybjorn.com) — 10+ years of nonfiction book reviews. 16k YouTube subscribers, 43k X followers.

## License

MIT
