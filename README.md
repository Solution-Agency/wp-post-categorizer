# WordPress Blog Post Categorizer

Automatically categorize your blog posts using Google Gemini.

## Dependencies

This project requires Deno to run.

Install Deno: https://deno.land/#installation

You'll also need a Gemini API key.

https://aistudio.google.com/app/apikey

## Usage:

Export your blog posts to an XML using the WordPress Exporter.

Run this tool on the export

```
deno run --env-file=.env --allow-env --allow-read --allow-net --allow-write index.ts
```

Delete your blog posts (don't worry, you have a backup)

Import the output file onto your WordPress website.
