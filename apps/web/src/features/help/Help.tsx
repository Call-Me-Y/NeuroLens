import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Search,
  ArrowRight,
  BookOpen,
  Compass,
  ChartNoAxesCombined,
  LifeBuoy,
} from "lucide-react";
import { PageHead, Badge, Empty } from "../../components/ui";
import { articles } from "./articles";
export default function Help() {
  const { slug } = useParams();
  const [query, setQuery] = useState("");
  const article = articles.find((a) => a.slug === slug);
  if (slug && !article)
    return (
      <Empty
        title="没有找到这篇帮助文章"
        description="请从帮助中心选择其他主题。"
      />
    );
  if (article)
    return (
      <div className="help-reader">
        <aside>
          <Link className="text-link" to="/help">
            ← 帮助中心
          </Link>
          {articles.map((a) => (
            <Link
              className={a.slug === slug ? "active" : ""}
              key={a.slug}
              to={"/help/" + a.slug}
            >
              {a.title}
            </Link>
          ))}
        </aside>
        <article>
          <Badge tone="neutral">{article.category} · 本地文档</Badge>
          <h1>{article.title}</h1>
          <p className="article-lead">{article.summary}</p>
          {article.sections.map(([title, body], i) => (
            <section id={"section-" + i} key={title}>
              <h2>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {title}
              </h2>
              <p>{body}</p>
            </section>
          ))}
          <div className="article-action">
            <span>准备好继续探索了吗？</span>
            <Link className="btn primary" to={article.to}>
              {article.action}
              <ArrowRight size={15} />
            </Link>
          </div>
        </article>
        <nav className="article-index">
          <span className="eyebrow">本页内容</span>
          {article.sections.map(([title], i) => (
            <a href={"#section-" + i} key={title}>
              {title}
            </a>
          ))}
        </nav>
      </div>
    );
  const results = articles.filter((a) =>
    (a.title + a.summary + a.sections.flat().join(""))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="help-hero">
        <div className="help-symbol">
          <BookOpen size={30} />
        </div>
        <PageHead
          eyebrow="HELP & RESEARCH GUIDES"
          title="每一步，都有清晰的指引。"
          description="从第一次体验，到读懂模型内部的安全机制。"
        />
        <div className="search help-search">
          <Search size={19} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索使用教程、指标或问题…"
          />
          <kbd>本地搜索</kbd>
        </div>
      </div>
      <div className="help-topics">
        {[
          {
            icon: Compass,
            title: "快速入门",
            desc: "了解工作空间，开始第一次分析",
            to: "quickstart",
          },
          {
            icon: ChartNoAxesCombined,
            title: "理解图表与指标",
            desc: "九视图、ASR 与神经元功能",
            to: "metrics",
          },
          {
            icon: LifeBuoy,
            title: "解决使用中的问题",
            desc: "环境、数据、文件与任务排查",
            to: "troubleshooting",
          },
        ].map((t) => (
          <Link key={t.to} to={"/help/" + t.to}>
            <t.icon size={24} />
            <h3>{t.title}</h3>
            <p>{t.desc}</p>
            <ArrowRight size={17} />
          </Link>
        ))}
      </div>
      <div className="section-title">
        <h2>{query ? `找到 ${results.length} 篇文章` : "指南与参考资料"}</h2>
        <Badge tone="green">离线可阅读</Badge>
      </div>
      <div className="help-grid">
        {results.map((a) => (
          <Link key={a.slug} className="article-card" to={"/help/" + a.slug}>
            <small>{a.category}</small>
            <h3>
              {a.title}
              <ArrowRight size={15} />
            </h3>
            <p>{a.summary}</p>
            <span>{a.sections.length} 个章节 · 阅读指南</span>
          </Link>
        ))}
      </div>
      {!results.length && (
        <Empty
          title="没有找到相关内容"
          description="可以尝试搜索“脱敏”“模型”或“ASR”。"
        />
      )}
    </>
  );
}
