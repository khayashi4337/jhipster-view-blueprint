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
- [x] MyBatis POJO生成 (`@Data` 付き)
- [x] Mapper Interface生成（アノテーションベース）
- [x] `.yo-rc.json` からの設定読み込み
- [x] `application.yml` へのNeedle追記

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

## MyBatis対応

### JDL構文

```jdl
@MyBatis
entity Product { ... }

@View
@MyBatis
entity ProductSummary { ... }
```

### アノテーション組み合わせ

| JDLの記述 | JPA生成 | MyBatis生成 |
|-----------|---------|-------------|
| なし | Entity + Repository + REST | なし |
| @View | Entity (@Immutable) + Repository + REST | なし |
| @MyBatis | Entity + Repository + REST | POJO + Mapper (CRUD) |
| @View + @MyBatis | Entity (@Immutable) + Repository + REST | POJO + Mapper (読み取り専用) |

**重要**: `@MyBatis` はJPA生成の「置き換え」ではなく「追加生成」。マスタ管理画面はJPAベースで自動生成されるため、JPA Entityは常に必要。

### 生成物の命名規則

| 生成物 | パス | 命名規則 | 例 |
|--------|------|----------|-----|
| JPA Entity | `domain/` | `{Entity}.java` | `Customer.java` |
| MyBatis POJO | `mybatis/model/` | `{Entity}Model.java` | `CustomerModel.java` |
| Mapper Interface | `mybatis/mapper/` | `{Entity}ModelMapper.java` | `CustomerModelMapper.java` |

### `.yo-rc.json` での設定

```json
{
  "generator-jhipster": { ... },
  "generator-jhipster-view-blueprint": {
    "mybatis": {
      "modelSuffix": "Model",
      "mapperSuffix": "ModelMapper",
      "modelPackage": "mybatis.model",
      "mapperPackage": "mybatis.mapper"
    }
  }
}
```

| 設定項目 | デフォルト値 | 説明 |
|----------|-------------|------|
| `modelSuffix` | `Model` | POJO クラス名の接尾辞 |
| `mapperSuffix` | `ModelMapper` | Mapper Interface 名の接尾辞 |
| `modelPackage` | `mybatis.model` | POJO のパッケージ（ベースパッケージからの相対） |
| `mapperPackage` | `mybatis.mapper` | Mapper のパッケージ（ベースパッケージからの相対） |

### `application.yml` への自動追記

JHipsterのNeedle機能を使用して `application.yml` に追記：

```yaml
# jhipster-needle-application-properties
mybatis:
  type-aliases-package: com.example.mybatis.model
  configuration:
    map-underscore-to-camel-case: true
```

## ブループリント構成

```
generators/
├── server/
│   └── generator.js      # サーバー側の読み取り専用化、MyBatis生成
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
- MyBatis POJO生成（`@MyBatis` アノテーション付きエンティティ）
- Mapper Interface生成（Viewの場合は読み取り専用、通常は CRUD）

**主要メソッド（View対応）:**
- `_addImmutableAnnotation()` - Entityに@Immutable追加
- `_makeRestApiReadOnly()` - REST APIから書き込みエンドポイント削除
- `_makeServiceReadOnly()` - Serviceから書き込みメソッド削除
- `_makeIntegrationTestReadOnly()` - 統合テストに@Disabled追加
- `_removeMethodByAnnotation()` - アノテーションでメソッド削除
- `_removeMethodBySignature()` - シグネチャでメソッド削除
- `_removeUnusedImports()` - 未使用import削除

**主要メソッド（MyBatis対応）:**
- `_loadMyBatisConfig()` - .yo-rc.jsonから設定読み込み
- `_generateMyBatisPojo()` - POJO生成
- `_generateMapperInterface()` - Mapper Interface生成
- `_appendMyBatisConfigToYaml()` - application.yml追記

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
- [MyBatis公式ドキュメント](https://mybatis.org/mybatis-3/ja/)
- [MyBatis Spring Boot Starter](https://mybatis.org/spring-boot-starter/mybatis-spring-boot-autoconfigure/)
