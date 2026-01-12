# FAQ（よくある質問）

## 基本的な質問

### Q: なぜViewにエンティティが必要なの？

**A:** JHipsterはJPA/Hibernateを使っています。データベースViewからデータを取得するには、そのViewにマッピングされたJPAエンティティが必要です。このブループリントがそれを自動生成します。

### Q: @Immutableって何？

**A:** Hibernateの `@Immutable` アノテーションは、このエンティティが「読み取り専用」であることを示します。Viewは通常INSERT/UPDATE/DELETEできないので、この指定が必要です。

```java
@Immutable  // ← これが自動で追加される
@Entity
@Table(name = "user_summary")
public class UserSummary { ... }
```

### Q: @Sql と @SqlFile、どっちを使うべき？

**A:**

| 方法 | 使うとき |
|------|----------|
| `@Sql("...")` | SQLが1〜2行の短いとき |
| `@SqlFile("path/to/file.sql")` | SQLが複雑なとき、コメントを残したいとき |

## MyBatis関連

### Q: @MyBatisを使うとJPAエンティティは生成されない？

**A:** いいえ、両方生成されます。@MyBatisはJPA生成の「置き換え」ではなく「追加」です。マスタ管理画面はJPAベースで自動生成されるため、JPA Entityは常に必要です。

### Q: MyBatis POJOとJPA Entityの違いは？

**A:**

| 項目 | JPA Entity | MyBatis POJO |
|------|-----------|--------------|
| パッケージ | domain/ | mybatis/model/ |
| アノテーション | @Entity, @Table | @Data (Lombok) |
| EntityManager | 管理対象 | 管理対象外 |
| 用途 | マスタ管理 | 業務ロジック |

### Q: Mapper XMLは生成される？

**A:** いいえ。アノテーションベースのMapper Interfaceのみ生成されます。複雑なSQLはマテリアルビューとして定義し、Mapperはシンプルに保つ設計です。

### Q: @View + @MyBatis と @MyBatis のみ、何が違う？

**A:**

- @View + @MyBatis: 読み取り専用Mapper (findAll, findById のみ)
- @MyBatis のみ: CRUD Mapper (findAll, findById, insert, update, deleteById)

### Q: ModelやMapperの命名を変えたい

**A:** `.yo-rc.json` で設定できます：

```json
{
  "generator-jhipster-view-blueprint": {
    "mybatis": {
      "modelSuffix": "Dto",
      "mapperSuffix": "DtoMapper"
    }
  }
}
```

### Q: MyBatisクラスが生成されない

**A:** 以下を確認してください：

1. JDLに `@MyBatis` アノテーションがあるか
2. ブループリントが正しくインストールされているか

## トラブルシューティング

### Q: "Entity file not found" エラーが出る

**A:** ブループリントのタイミングの問題かもしれません。以下を試してください：

```bash
# キャッシュをクリアして再生成
rm -rf node_modules/.cache
jhipster jdl app.jdl --blueprints generator-jhipster-view-blueprint --force
```

### Q: SQLファイルが読み込まれない

**A:** ファイルパスを確認してください。パスはプロジェクトルートからの相対パスです。

```jdl
// NG: 絶対パス
@SqlFile("/home/user/views/my.sql")

// OK: 相対パス
@SqlFile("views/my.sql")
```

ファイルが存在するか確認：
```bash
ls -la views/my.sql
```

### Q: Liquibase changelogが生成されない

**A:** `@View` アノテーションが付いているか確認してください。`@Sql` または `@SqlFile` だけでは不十分です。

```jdl
// NG: @Viewがない
@Sql("SELECT ...")
entity MyView { ... }

// OK: @Viewがある
@View
@Sql("SELECT ...")
entity MyView { ... }
```

### Q: CREATE VIEW文を書いたらエラーになる

**A:** `@Sql` にはSELECT文だけを書いてください。`CREATE VIEW ... AS` は自動で付きます。

```jdl
// NG
@Sql("CREATE VIEW my_view AS SELECT id, name FROM users")

// OK
@Sql("SELECT id, name FROM users")
```

ただし、`@SqlFile` で参照するファイルにCREATE VIEW文を書いた場合は、自動でSELECT部分が抽出されます。

### Q: "mybatis" package not found エラー

**A:** MyBatis Spring Boot Starterの依存関係を追加してください：

```xml
<dependency>
    <groupId>org.mybatis.spring.boot</groupId>
    <artifactId>mybatis-spring-boot-starter</artifactId>
    <version>3.0.3</version>
</dependency>
```

## アーキテクチャ

### Q: 既存のJHipsterプロジェクトに追加できる？

**A:** はい。`.yo-rc.json` にブループリントを追加して、Viewエンティティを含むJDLをインポートしてください。

```json
{
  "generator-jhipster": {
    ...
    "blueprints": [
      {
        "name": "generator-jhipster-view-blueprint",
        "version": "0.0.1"
      }
    ]
  }
}
```

### Q: JDLパーサーをフォークしなくて大丈夫？

**A:** 大丈夫です。JHipsterはカスタムアノテーションをネイティブサポートしています。`@View`、`@Sql`、`@SqlFile` は `.jhipster/Entity.json` の `annotations` フィールドに自動で保存されます。

```json
{
  "name": "UserSummary",
  "annotations": {
    "view": true,
    "sql": "SELECT id, name FROM users"
  }
}
```

### Q: Viewのカラム名とエンティティのフィールド名が違う場合は？

**A:** JDLでフィールドを定義し、SQLでAS句を使ってカラム名を合わせてください。

```jdl
@View
@Sql("SELECT id, user_name AS userName FROM users")
entity UserView {
    userName String  // SQLのAS句と一致させる
}
```

## その他

### Q: PostgreSQL以外でも使える？

**A:** Liquibaseの `createView` はほとんどのDBMSで動作します（MySQL, PostgreSQL, Oracle, SQL Server等）。ただし、SQL構文はDBMS固有なので、適切な構文を使ってください。

### Q: リレーションは定義できる？

**A:** Viewエンティティは読み取り専用なので、リレーションの定義は推奨しません。必要であれば、通常のエンティティと同様にJDLで定義できますが、外部キー制約などはLiquibaseで手動管理が必要です。
