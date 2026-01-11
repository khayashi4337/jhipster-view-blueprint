# JHipster View Blueprint

## 概要
JHipsterでデータベースViewをサポートするブループリント。
レガシーシステム移行時に既存ViewをJPAエンティティとしてマッピングし、Liquibaseで管理する。

## ゴール
1. JDLのカスタムアノテーションでView定義
2. LiquibaseにcreateView changelogを生成
3. Entityは読み取り専用（@Immutable）

## JDL構文

### 案1: @Sql（短いSQL向け）
```jdl
@View
@Sql("CREATE VIEW user_summary AS SELECT id, name FROM users")
entity UserSummary {
  name String
}
```

### 案3: @SqlFile（複雑なSQL向け）
```jdl
@View
@SqlFile(views/user_summary.sql)
entity UserSummary {
  name String
  orderCount Integer
}
```

## 実装方針

### JDLパーサー
- フォーク不要。JHipsterはカスタムアノテーションをネイティブサポート
- `@View`, `@Sql`, `@SqlFile` は `.jhipster/Entity.json` の `options` に格納される

### ブループリント構成
```
generators/
├── server/
│   └── index.js          # @Immutable付与、Repository読み取り専用化
└── liquibase/
    └── index.js          # createView changelog生成
templates/
└── liquibase/
    └── view-changelog.xml.ejs
```

### Liquibase出力
```xml
<changeSet id="YYYYMMDDHHMMSS-create-view-entity-name" author="jhipster">
    <createView viewName="entity_table_name" replaceIfExists="true">
        <!-- SQLここ -->
    </createView>
</changeSet>
```

## タスク

- [ ] `jhipster generate-blueprint` でスケルトン作成
- [ ] カスタムアノテーション読み取りの動作確認
- [ ] Liquibaseジェネレーターのオーバーライド実装
- [ ] @Sql と @SqlFile の両方をサポート
- [ ] サンプルJDLで動作テスト

## 参考
- JHipster Blueprint作成: https://www.jhipster.tech/modules/creating-a-blueprint/
- JDLカスタムアノテーション: options キーに格納される
- Liquibase createView: https://docs.liquibase.com/change-types/create-view.html
```

