# JHipster View Blueprint - 開発ノート

## 概要

JHipsterでデータベースViewをサポートするブループリント。
レガシーシステム移行時に既存ViewをJPAエンティティとしてマッピングし、Liquibaseで管理する。

## 実装完了

- [x] JDLアノテーション (`@View`, `@Sql`, `@SqlFile`) のパース
- [x] Liquibase `createView` changelog生成
- [x] Entity `@Immutable` アノテーション付与
- [x] REST API読み取り専用化 (POST/PUT/PATCH/DELETE削除)
- [x] Service読み取り専用化 (save/update/delete削除)
- [x] フロントエンド読み取り専用化 (`entity.readOnly = true`)
- [x] 統合テスト `@Disabled` 対応
- [x] Liquibaseテーブル定義XML抑制
- [x] fake-data削除

## JDL構文

### @Sql（短いSQL向け）

```jdl
@View
@Sql("SELECT id, name, email FROM customer WHERE active = true")
entity ActiveCustomer {
  name String
  email String
}
```

### @SqlFile（複雑なSQL向け）

```jdl
@View
@SqlFile(views/order_statistics.sql)
entity OrderStatistics {
  customerId Long
  totalOrders Integer
}
```

## ブループリント構成

```
generators/
├── server/
│   └── generator.js      # サーバー側の読み取り専用化
└── liquibase/
    └── generator.js      # createView生成、テーブル定義抑制
```

## 実装詳細

### generators/server/generator.js

**フェーズ: PREPARING_EACH_ENTITY**
- Viewエンティティを検出 (`entity.annotations.View`)
- `entity.readOnly = true` を設定 (JHipsterにフロントエンド制御を委譲)
- `entity.isView = true` を設定
- View SQL情報を `entity.viewSql` / `entity.viewSqlFile` に保存

**フェーズ: POST_WRITING_ENTITIES**
- `@Immutable` アノテーションをEntityクラスに追加
- REST APIから書き込みエンドポイントを削除 (`@PostMapping`, `@PutMapping`, `@PatchMapping`, `@DeleteMapping`)
- Serviceから書き込みメソッドを削除 (`save`, `update`, `partialUpdate`, `delete`)
- 統合テストに `@Disabled` アノテーションを追加

**主要メソッド:**
- `_addImmutableAnnotation()` - Entityに@Immutable追加
- `_makeRestApiReadOnly()` - REST APIから書き込みエンドポイント削除
- `_makeServiceReadOnly()` - Serviceから書き込みメソッド削除
- `_makeIntegrationTestReadOnly()` - 統合テストに@Disabled追加
- `_removeMethodByAnnotation()` - アノテーションでメソッド削除
- `_removeMethodBySignature()` - シグネチャでメソッド削除
- `_removeUnusedImports()` - 未使用import削除

### generators/liquibase/generator.js

**フェーズ: PREPARING**
- Viewエンティティのリストを収集

**フェーズ: WRITING**
- `createView` changelogを生成
- タイムスタンプ: `YYYYMMDDHHMMSS + 3桁カウンタ`

**フェーズ: END**
- テーブル定義XMLを削除 (`*_added_entity_*.xml`)
- fake-dataを削除 (`fake-data/*.csv`)

**主要メソッド:**
- `_resolveViewSql()` - @Sql/@SqlFileからSQL取得（パストラバーサル防止付き）
- `_escapeXml()` - XMLエスケープ
- `_toSnakeCase()` - キャメルケース→スネークケース変換
- `_generateTimestamp()` - タイムスタンプ生成

## フロントエンド対応

JHipster 8.x は `entity.readOnly = true` フラグをネイティブサポート。
このブループリントでViewエンティティにこのフラグを設定することで、
JHipsterが自動的に以下を行う：

- update/delete コンポーネントを生成しない
- ルーティングに new/edit パスを含めない
- サービスから create/update/delete メソッドを除外
- テンプレートから作成/編集/削除ボタンを除外
- テストコードも読み取り専用に対応

**追加の実装は不要。**

## テストコード対応

### Java統合テスト

Viewエンティティは `@Immutable` のため `saveAndFlush()` / `delete()` が使えない。
統合テストクラス (`*ResourceIT.java`) に以下を追加：

1. `@Disabled` アノテーション
2. 理由を説明するJavadocコメント
3. `import org.junit.jupiter.api.Disabled;`

### Angularテスト

`entity.readOnly = true` により、JHipsterが自動的に読み取り専用テストを生成。
追加対応不要。

## セキュリティ考慮事項

### XMLエスケープ

SQL文をLiquibase XMLに埋め込む際、以下の文字をエスケープ：
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&apos;`

### パストラバーサル防止

`@SqlFile` のパス検証：
- `..` を含むパスを拒否
- プロジェクトルート外のパスを拒否

### 行末記号の保持

Windows (CRLF) / Unix (LF) の行末記号を検出し、編集後も維持。

## 参考リンク

- [JHipster Blueprint作成](https://www.jhipster.tech/modules/creating-a-blueprint/)
- [Liquibase createView](https://docs.liquibase.com/change-types/create-view.html)
- [Hibernate @Immutable](https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html#entity-immutability)
