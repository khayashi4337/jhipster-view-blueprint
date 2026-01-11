# JHipster View Blueprint

JHipsterでデータベースViewをサポートするブループリント。

## これは何？

通常、JHipsterはテーブルに対応するエンティティしか生成できません。
このブループリントを使うと、**データベースView**に対応するエンティティを生成できます。

### 主な機能

- JDLで `@View` アノテーションを付けるだけでView対応エンティティを定義
- Liquibaseに `createView` のchangelogを自動生成
- エンティティに `@Immutable` アノテーションを自動付与（読み取り専用）

## インストール

```bash
npm install -g generator-jhipster-view-blueprint
```

または、ローカルで開発する場合：

```bash
git clone <このリポジトリ>
cd jhipster-view-blueprint
npm install
npm link
```

## 使い方

### 1. JDLでViewエンティティを定義

```jdl
// 方法1: インラインSQL（短いSQL向け）
@View
@Sql("SELECT id, name, email FROM jhi_user")
entity UserSummary {
    name String
    email String
}

// 方法2: SQLファイル参照（複雑なSQL向け）
@View
@SqlFile("views/order_statistics.sql")
entity OrderStatistics {
    customerId Long
    customerName String
    totalOrders Integer
}
```

### 2. JHipsterでアプリケーション生成

```bash
jhipster jdl your-app.jdl --blueprints generator-jhipster-view-blueprint
```

### 3. 生成されるもの

| ファイル | 内容 |
|---------|------|
| `domain/UserSummary.java` | `@Immutable` 付きエンティティ |
| `repository/UserSummaryRepository.java` | 読み取り専用リポジトリ |
| `changelog/xxx_create_view_user_summary.xml` | Liquibase createView |

## ドキュメント

- [クイックスタート](docs/QUICKSTART.md) - 5分で始める
- [FAQ](docs/FAQ.md) - よくある質問

## 仕組み

```
JDL (@View, @Sql/@SqlFile)
        ↓
   JHipsterパーサー
        ↓
  .jhipster/Entity.json (annotations に保存)
        ↓
┌───────────────────────────────────────┐
│  このブループリント                    │
│  ├── server/generator.js              │
│  │   └── @Immutable アノテーション追加 │
│  └── liquibase/generator.js           │
│      └── createView changelog生成     │
└───────────────────────────────────────┘
        ↓
   生成されたJavaコード + Liquibase
```

## ライセンス

Apache-2.0
