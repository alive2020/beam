/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.apache.beam.sdk.io.kafka;

import static org.apache.beam.vendor.guava.v26_0_jre.com.google.common.base.Preconditions.checkArgument;

import com.google.auto.value.AutoValue;
import java.io.Serializable;
import java.util.List;
import javax.annotation.Nullable;
import org.apache.beam.sdk.schemas.AutoValueSchema;
import org.apache.beam.sdk.schemas.annotations.DefaultSchema;
import org.apache.beam.sdk.schemas.annotations.SchemaCreate;
import org.apache.beam.sdk.schemas.annotations.SchemaFieldName;
import org.apache.beam.sdk.schemas.annotations.SchemaIgnore;
import org.apache.kafka.common.TopicPartition;
import org.joda.time.Instant;

/** Represents a Kafka source description. */
@DefaultSchema(AutoValueSchema.class)
@AutoValue
@SuppressWarnings({
  "nullness" // TODO(https://github.com/apache/beam/issues/20497)
})
public abstract class KafkaSourceDescriptor implements Serializable {
  @SchemaFieldName("topic")
  abstract String getTopic();

  @SchemaFieldName("partition")
  abstract Integer getPartition();

  @SchemaFieldName("start_read_offset")
  @Nullable
  abstract Long getStartReadOffset();

  @SchemaFieldName("start_read_time")
  @Nullable
  abstract Instant getStartReadTime();

  @SchemaFieldName("stop_read_offset")
  @Nullable
  abstract Long getStopReadOffset();

  @SchemaFieldName("stop_read_time")
  @Nullable
  abstract Instant getStopReadTime();

  @SchemaFieldName("bootstrap_servers")
  @Nullable
  abstract List<String> getBootStrapServers();

  private TopicPartition topicPartition = null;

  @SchemaIgnore
  public TopicPartition getTopicPartition() {
    if (topicPartition == null) {
      topicPartition = new TopicPartition(getTopic(), getPartition());
    }
    return topicPartition;
  }

  public static KafkaSourceDescriptor of(
      TopicPartition topicPartition,
      Long startReadOffset,
      Instant startReadTime,
      Long stopReadOffset,
      Instant stopReadTime,
      List<String> bootstrapServers) {
    checkArguments(startReadOffset, startReadTime, stopReadOffset, stopReadTime);
    return new AutoValue_KafkaSourceDescriptor(
        topicPartition.topic(),
        topicPartition.partition(),
        startReadOffset,
        startReadTime,
        stopReadOffset,
        stopReadTime,
        bootstrapServers);
  }

  private static void checkArguments(
      Long startReadOffset, Instant startReadTime, Long stopReadOffset, Instant stopReadTime) {
    checkArgument(
        startReadOffset == null || startReadTime == null,
        "startReadOffset and startReadTime are optional but mutually exclusive. Please set only one of them.");
    checkArgument(
        stopReadOffset == null || stopReadTime == null,
        "stopReadOffset and stopReadTime are optional but mutually exclusive. Please set only one of them.");
  }

  @SchemaCreate
  @SuppressWarnings("all")
  // TODO(BEAM-10677): Remove this function after AutoValueSchema is fixed.
  static KafkaSourceDescriptor create(
      String topic,
      Integer partition,
      Long start_read_offset,
      Instant start_read_time,
      Long stop_read_offset,
      Instant stop_read_time,
      List<String> bootstrap_servers) {
    checkArguments(start_read_offset, start_read_time, stop_read_offset, stop_read_time);
    return new AutoValue_KafkaSourceDescriptor(
        topic,
        partition,
        start_read_offset,
        start_read_time,
        stop_read_offset,
        stop_read_time,
        bootstrap_servers);
  }
}
