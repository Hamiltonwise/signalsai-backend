import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AlloroPostsDocs() {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          Alloro Posts Documentation
        </h1>
      </div>

      {/* Overview */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          Alloro Posts is a flexible content management system that lets you
          create custom post types, organize content with categories and tags,
          and display posts on any page using Post Blocks and shortcodes.
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">
          <strong>Post Types</strong> are defined at the template level (e.g.,
          Blog Posts, Reviews, Services). <strong>Posts</strong> are created
          per-project and belong to a post type. <strong>Post Blocks</strong> are
          reusable UI components that define how posts are rendered on live pages.
        </p>
      </section>

      {/* Post Types */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Post Types</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          Post types define the kind of content a website can have. They are
          created inside a template under the <strong>Post Blocks</strong> tab.
          Each post type gets an auto-generated slug used in shortcodes.
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">
          Examples: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">Blog Posts</code>,{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">Reviews</code>,{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">Services</code>,{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">Menu Items</code>
        </p>
      </section>

      {/* Custom Fields */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Custom Fields</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          Each post type can define a <strong>custom fields schema</strong>, a set of
          typed fields that appear in the post editor. This lets you add structured data
          beyond title, content, and excerpt.
        </p>
        <h3 className="text-sm font-semibold text-gray-800 mt-2">Supported Field Types</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-semibold text-gray-700">Type</th>
                <th className="text-left py-2 font-semibold text-gray-700">Description</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 font-mono text-xs">text</td><td className="py-1.5">Single-line text input</td></tr>
              <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 font-mono text-xs">textarea</td><td className="py-1.5">Multi-line text input</td></tr>
              <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 font-mono text-xs">media_url</td><td className="py-1.5">URL field for images/media</td></tr>
              <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 font-mono text-xs">number</td><td className="py-1.5">Numeric input</td></tr>
              <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 font-mono text-xs">date</td><td className="py-1.5">Date picker</td></tr>
              <tr className="border-b border-gray-100"><td className="py-1.5 pr-4 font-mono text-xs">boolean</td><td className="py-1.5">Checkbox (true/false)</td></tr>
              <tr><td className="py-1.5 pr-4 font-mono text-xs">select</td><td className="py-1.5">Dropdown with predefined options</td></tr>
            </tbody>
          </table>
        </div>
        <h3 className="text-sm font-semibold text-gray-800 mt-2">Using Custom Fields in Post Blocks</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          Access custom field values using the token{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{"{{post.custom.<field_slug>}}"}</code>.
          The field slug is auto-generated from the field name (lowercase, underscores).
        </p>
        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-green-400 font-mono whitespace-pre">{`<span class="price">\${{post.custom.price}}</span>
<span class="duration">{{post.custom.duration}}</span>`}</pre>
        </div>
      </section>

      {/* Taxonomy */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Categories &amp; Tags
        </h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          Each post type has its own set of categories and tags. Categories are
          hierarchical (can have parent categories) while tags are flat.
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">
          Categories and tags can be managed from the Posts tab when editing a
          website project, or created inline when adding a new post.
        </p>
      </section>

      {/* Post Blocks */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Post Blocks</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          Post Blocks are reusable HTML templates that define how posts are
          displayed. They are created at the template level and can be embedded
          in any project page using shortcodes.
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">
          Each Post Block is associated with a specific post type and uses
          tokens to insert post data dynamically.
        </p>
      </section>

      {/* Single Post Pages */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Single Post Pages</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          Each post type can have a <strong>single post template</strong>, a page layout
          for viewing an individual post. When a visitor navigates to a post URL, the
          renderer uses this template to build the page.
        </p>
        <h3 className="text-sm font-semibold text-gray-800 mt-2">URL Pattern</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          Single post pages use the pattern{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
            /{"{post-type-slug}"}/{"{post-slug}"}
          </code>
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">
          Example: A "Services" post type with a post titled "Dental Implants" renders at{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">/services/dental-implants</code>
        </p>
        <h3 className="text-sm font-semibold text-gray-800 mt-2">Priority</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          <strong>Pages always win over post URLs.</strong> If a regular page exists at{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">/services</code>,
          it renders as a page. But{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">/services/dental-implants</code>{" "}
          renders the post because no page exists at that path.
        </p>
        <h3 className="text-sm font-semibold text-gray-800 mt-2">Linking with {"{{post.url}}"}</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          Use the <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{"{{post.url}}"}</code>{" "}
          token in your post blocks to create links to single post pages:
        </p>
        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-green-400 font-mono whitespace-pre">{`<a href="{{post.url}}" style="color: #3b82f6;">Read More →</a>`}</pre>
        </div>
        <h3 className="text-sm font-semibold text-gray-800 mt-2">Creating a Single Template</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          Click the <strong>template icon</strong> (purple) on a post type in the Post Blocks tab.
          The editor works like a page section editor, use the same{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{"{{post.*}}"}</code>{" "}
          tokens. The template is rendered inside the site's wrapper, header, and footer.
        </p>
      </section>

      {/* Tokens */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Available Tokens
        </h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          Use these tokens inside your Post Block HTML. They are replaced with
          actual post data at render time. Wrap the repeating portion with
          loop markers.
        </p>
        <h3 className="text-sm font-semibold text-gray-800 mt-4">
          Loop Markers
        </h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          Use <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{"{{start_post_loop}}"}</code> and{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{"{{end_post_loop}}"}</code> to
          define which part of the HTML repeats per post. Everything outside the
          markers is rendered once (e.g., a grid wrapper). If no markers are
          present, the entire block repeats per post.
        </p>
        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto mt-2">
          <pre className="text-sm text-green-400 font-mono whitespace-pre">{`<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;">
  {{start_post_loop}}
  <div class="card">
    <h3>{{post.title}}</h3>
    <p>{{post.excerpt}}</p>
  </div>
  {{end_post_loop}}
</div>`}</pre>
        </div>
        <h3 className="text-sm font-semibold text-gray-800 mt-4">
          Post Data Tokens
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-semibold text-gray-700">
                  Token
                </th>
                <th className="text-left py-2 font-semibold text-gray-700">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    {"{{post.title}}"}
                  </code>
                </td>
                <td className="py-2">The post title</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    {"{{post.slug}}"}
                  </code>
                </td>
                <td className="py-2">URL-friendly slug</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    {"{{post.url}}"}
                  </code>
                </td>
                <td className="py-2">Relative URL to single post page (e.g., /services/dental-implants)</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    {"{{post.content}}"}
                  </code>
                </td>
                <td className="py-2">
                  Full post content (rendered as raw HTML)
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    {"{{post.excerpt}}"}
                  </code>
                </td>
                <td className="py-2">Short summary of the post</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    {"{{post.featured_image}}"}
                  </code>
                </td>
                <td className="py-2">URL of the featured image</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    {"{{post.categories}}"}
                  </code>
                </td>
                <td className="py-2">Comma-separated category names</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    {"{{post.tags}}"}
                  </code>
                </td>
                <td className="py-2">Comma-separated tag names</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    {"{{post.created_at}}"}
                  </code>
                </td>
                <td className="py-2">Creation date</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    {"{{post.published_at}}"}
                  </code>
                </td>
                <td className="py-2">Publication date</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    {"{{post.custom.<slug>}}"}
                  </code>
                </td>
                <td className="py-2">Custom field value by slug (e.g., {"{{post.custom.price}}"})</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Shortcode Syntax */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Shortcode Syntax
        </h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          Embed a Post Block on any live page by adding a shortcode to the page
          HTML. The shortcode is resolved at request time.
        </p>

        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
          <code className="text-sm text-green-400 font-mono whitespace-pre">
            {"{{ post_block id='<block-slug>' items='<post-type-slug>' }}"}
          </code>
        </div>

        <h3 className="text-sm font-semibold text-gray-800 mt-4">
          All Attributes
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-semibold text-gray-700">
                  Attribute
                </th>
                <th className="text-left py-2 pr-4 font-semibold text-gray-700">
                  Required
                </th>
                <th className="text-left py-2 pr-4 font-semibold text-gray-700">
                  Default
                </th>
                <th className="text-left py-2 font-semibold text-gray-700">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">id</td>
                <td className="py-2 pr-4">Yes</td>
                <td className="py-2 pr-4">-</td>
                <td className="py-2">
                  Slug of the Post Block from the template
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">items</td>
                <td className="py-2 pr-4">Yes</td>
                <td className="py-2 pr-4">-</td>
                <td className="py-2">Slug of the post type to query</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">tags</td>
                <td className="py-2 pr-4">No</td>
                <td className="py-2 pr-4">-</td>
                <td className="py-2">
                  Comma-separated tag slugs to filter by
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">cats</td>
                <td className="py-2 pr-4">No</td>
                <td className="py-2 pr-4">-</td>
                <td className="py-2">
                  Comma-separated category slugs to filter by
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">ids</td>
                <td className="py-2 pr-4">No</td>
                <td className="py-2 pr-4">-</td>
                <td className="py-2">
                  Comma-separated post IDs to include (only these)
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">exc_ids</td>
                <td className="py-2 pr-4">No</td>
                <td className="py-2 pr-4">-</td>
                <td className="py-2">
                  Comma-separated post IDs to exclude
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">order</td>
                <td className="py-2 pr-4">No</td>
                <td className="py-2 pr-4">asc</td>
                <td className="py-2">
                  Sort order: <code className="bg-gray-100 px-1 rounded text-xs">asc</code> or{" "}
                  <code className="bg-gray-100 px-1 rounded text-xs">desc</code>
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">order_by</td>
                <td className="py-2 pr-4">No</td>
                <td className="py-2 pr-4">created_at</td>
                <td className="py-2">
                  Column to sort by:{" "}
                  <code className="bg-gray-100 px-1 rounded text-xs">created_at</code>,{" "}
                  <code className="bg-gray-100 px-1 rounded text-xs">published_at</code>,{" "}
                  <code className="bg-gray-100 px-1 rounded text-xs">sort_order</code>,{" "}
                  <code className="bg-gray-100 px-1 rounded text-xs">title</code>
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">limit</td>
                <td className="py-2 pr-4">No</td>
                <td className="py-2 pr-4">10</td>
                <td className="py-2">Maximum number of posts to render</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">offset</td>
                <td className="py-2 pr-4">No</td>
                <td className="py-2 pr-4">0</td>
                <td className="py-2">
                  Number of posts to skip (for pagination)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Examples */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Examples</h2>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              Display all blog posts:
            </p>
            <div className="bg-gray-900 rounded-lg p-3">
              <code className="text-sm text-green-400 font-mono">
                {"{{ post_block id='blog-grid' items='blog-posts' }}"}
              </code>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              Display 5 latest reviews, newest first:
            </p>
            <div className="bg-gray-900 rounded-lg p-3">
              <code className="text-sm text-green-400 font-mono">
                {"{{ post_block id='review-carousel' items='reviews' order='desc' order_by='published_at' limit='5' }}"}
              </code>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              Display posts from a specific category:
            </p>
            <div className="bg-gray-900 rounded-lg p-3">
              <code className="text-sm text-green-400 font-mono">
                {"{{ post_block id='service-list' items='services' cats='dental-implants' }}"}
              </code>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              Display a single specific post:
            </p>
            <div className="bg-gray-900 rounded-lg p-3">
              <code className="text-sm text-green-400 font-mono">
                {"{{ post_block id='featured-review' items='reviews' ids='abc123-uuid' limit='1' }}"}
              </code>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              Exclude specific posts:
            </p>
            <div className="bg-gray-900 rounded-lg p-3">
              <code className="text-sm text-green-400 font-mono">
                {"{{ post_block id='blog-grid' items='blog-posts' exc_ids='id1,id2' }}"}
              </code>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Workflow</h2>
        <ol className="text-sm text-gray-700 leading-relaxed space-y-2 list-decimal list-inside">
          <li>
            <strong>Create a Post Type</strong> in the template's Post Blocks
            tab (e.g., "Reviews").
          </li>
          <li>
            <strong>Define Custom Fields</strong> (optional), click the gear icon
            on a post type to add fields like price, duration, rating, etc.
          </li>
          <li>
            <strong>Create a Post Block</strong> using the visual editor. Add
            your HTML layout using the available tokens including custom field tokens.
          </li>
          <li>
            <strong>Add posts</strong> to your website project under the Posts
            tab. Fill in custom fields, assign categories and tags as needed.
          </li>
          <li>
            <strong>Embed the shortcode</strong> in any page's HTML where you
            want posts to appear.
          </li>
          <li>
            Posts are rendered at request time. Updates to posts or post blocks
            take effect within minutes (cached for performance).
          </li>
        </ol>
      </section>

      {/* Caching */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Caching</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          Post blocks and post queries are cached in Redis for performance:
        </p>
        <ul className="text-sm text-gray-700 leading-relaxed space-y-1 list-disc list-inside">
          <li>
            <strong>Post Block design:</strong> cached for 5 minutes
          </li>
          <li>
            <strong>Post queries:</strong> cached for 2 minutes
          </li>
          <li>
            Caches are automatically invalidated when you update a post block or
            modify posts from the admin panel.
          </li>
        </ul>
      </section>
    </div>
  );
}
