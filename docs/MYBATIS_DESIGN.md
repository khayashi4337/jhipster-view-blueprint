# MyBatis対応 設計メモ

## 想定

- マスタ管理系はJPA、業務系はMyBatisという構成
- マテリアルビューを多用しており、View + MyBatisの組み合わせが必要

## 構成

| 区分 | ORM | 生成物 | APIアクセス |
|------|-----|--------|-------------|
| マスタ系 | JPA | Entity, Repository, REST, Service | REST経由 |
| 業務系 (View) | MyBatis | POJO, Mapper Interface | Thymeleafから直接 |

## 方針

### 別ブループリントではなく、このjhipster-view-blueprintリポジトリを拡張する理由

- `@View` の意味（読み取り専用、SQL情報）を別ブループリントは知らない
- 共通ライブラリ化は管理が複雑
- 一元管理の方が現実的

### アノテーションによる切り替え

| JDLの記述 | JPA生成 | MyBatis生成 |
|-----------|---------|-------------|
| （アノテーションなし） | Entity + Repository + REST + Service | なし |
| `@View` のみ | Entity (@Immutable) + Repository + REST + Service | なし |
| `@View` + `@MyBatis` | Entity (@Immutable) + Repository + REST + Service | POJO + Mapper (読み取り専用) |
| `@MyBatis` のみ | Entity + Repository + REST + Service | POJO + Mapper (CRUD) |

**重要**: `@MyBatis` はJPA生成の「置き換え」ではなく「追加生成」。マスタ管理画面はJPAベースで自動生成されるため、JPA Entityは常に必要。

## 生成物の詳細

### 命名規則

| 生成物 | パス | 命名規則 | 例 |
|--------|------|----------|-----|
| JPA Entity | `domain/` | `{Entity}.java` | `Customer.java` |
| MyBatis POJO | `mybatis/model/` | `{Entity}Model.java` | `CustomerModel.java` |
| Mapper Interface | `mybatis/mapper/` | `{Entity}ModelMapper.java` | `CustomerModelMapper.java` |

命名規則は `.yo-rc.json` で設定可能（後述）。

### MyBatis POJO

```java
package com.example.mybatis.model;

import lombok.Data;

@Data
public class CustomerModel {
    private Long id;
    private String name;
    private String email;
}
```

### Mapper Interface

**`@View` + `@MyBatis` の場合（読み取り専用）:**

Mapperは単純に `SELECT * FROM {view_name}` を使用。複雑なSQLはマテリアルビューが吸収しているため、Mapper側はシンプルに保つ。

```java
package com.example.mybatis.mapper;

import com.example.mybatis.model.OrderSummaryModel;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface OrderSummaryModelMapper {
    @Select("SELECT * FROM order_summary")
    List<OrderSummaryModel> findAll();

    @Select("SELECT * FROM order_summary WHERE id = #{id}")
    OrderSummaryModel findById(Long id);
}
```

**`@MyBatis` のみの場合（CRUD）:**

```java
package com.example.mybatis.mapper;

import com.example.mybatis.model.CustomerModel;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface CustomerModelMapper {
    @Select("SELECT * FROM customer")
    List<CustomerModel> findAll();

    @Select("SELECT * FROM customer WHERE id = #{id}")
    CustomerModel findById(Long id);

    @Insert("INSERT INTO customer (name, email) VALUES (#{name}, #{email})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insert(CustomerModel customer);

    @Update("UPDATE customer SET name = #{name}, email = #{email} WHERE id = #{id}")
    void update(CustomerModel customer);

    @Delete("DELETE FROM customer WHERE id = #{id}")
    void deleteById(Long id);
}
```

## JPA vs MyBatis Entity の違い

| 項目 | JPA | MyBatis |
|------|-----|---------|
| クラスアノテーション | `@Entity`, `@Table`, `@Immutable` | なし（`@Data` のみ） |
| フィールドアノテーション | `@Id`, `@Column` | なし |
| マッピング | アノテーション/XML | Mapper側で定義 |
| EntityManager | ✅ 管理対象 | ❌ 管理対象外 |

### クラス共存について

JPA EntityとMyBatis POJOは別クラスとして共存。

- JPA Entity: `@Entity` あり → EntityManager管理対象
- MyBatis POJO: `@Entity` なし → EntityManager管理対象外

**パッケージ分離:**

```
src/main/java/com/example/
├── domain/              # JPA Entity（EntityManager管理）
│   └── Customer.java    # @Entity あり
└── mybatis/
    ├── model/           # MyBatis POJO（管理対象外）
    │   └── CustomerModel.java
    └── mapper/          # Mapper Interface
        └── CustomerModelMapper.java
```

## 設定

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

## 決定事項

| 項目 | 決定 | 理由 |
|------|------|------|
| `@MyBatis`の意味 | JPA + MyBatis両方生成 | マスタ管理画面にJPA Entity必須 |
| POJO命名 | `{Entity}Model.java` | 検索/置換時の衝突回避 |
| Mapper命名 | `{Entity}ModelMapper.java` | POJOと命名を統一 |
| 設定ファイル | `.yo-rc.json` | JHipster標準の設定方式 |
| Lombok | `@Data` を使用 | シンプルなPOJO生成 |
| Mapper XML | 生成しない | マテリアルビューが複雑なSQLを吸収 |
| View時のSQL | `SELECT * FROM view_name` | Mapperはシンプルに |
| MyBatis設定 | Needleで自動追記 | `application.yml` に安全に追記可能 |
| Controller | 対象外 | 既存システムの画面を再現するため手書き |

## 実装ステップ

1. `@MyBatis` アノテーションの検出ロジック追加
2. `.yo-rc.json` からMyBatis設定読み込み
3. MyBatis POJO テンプレート作成（`@Data` 付き）
4. Mapper Interface テンプレート作成（アノテーションベース）
5. `application.yml` へのNeedle追記実装
6. `@View` + `@MyBatis` の組み合わせ対応（読み取り専用Mapper）
7. `@MyBatis` のみの対応（CRUD Mapper）
8. テスト

## 参考

- [MyBatis公式ドキュメント](https://mybatis.org/mybatis-3/ja/)
- [MyBatis Spring Boot Starter](https://mybatis.org/spring-boot-starter/mybatis-spring-boot-autoconfigure/)
