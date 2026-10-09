import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme/tokens';
import { Icon } from './Icon';

export type TimelineStepStatus = 'done' | 'current' | 'pending';

export type TimelineStep = {
  label: string;
  sublabel?: string;
  status: TimelineStepStatus;
};

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <View key={i} style={styles.row}>
            <View style={styles.railCol}>
              <Dot status={step.status} />
              {!isLast && (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: step.status === 'done' ? colors.success : colors.border }
                  ]}
                />
              )}
            </View>
            <View style={[styles.text, { paddingBottom: isLast ? 0 : 22 }]}>
              <Text
                style={[
                  styles.label,
                  step.status === 'current' && { color: colors.amberText },
                  step.status === 'pending' && { color: colors.textTertiary }
                ]}
              >
                {step.label}
              </Text>
              {step.sublabel ? <Text style={styles.sublabel}>{step.sublabel}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Dot({ status }: { status: TimelineStepStatus }) {
  if (status === 'done') {
    return (
      <View style={[styles.dot, { backgroundColor: colors.success }]}>
        <Icon name="checkCircle" size={13} color="#fff" strokeWidth={2.6} />
      </View>
    );
  }
  if (status === 'current') {
    return <View style={[styles.dot, { backgroundColor: colors.amberSoft, borderWidth: 2, borderColor: colors.amber }]} />;
  }
  return <View style={[styles.dot, { backgroundColor: colors.neutralSoft, borderWidth: 2, borderColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 14
  },
  railCol: {
    alignItems: 'center',
    width: 26
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center'
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 28
  },
  text: {
    flex: 1
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textPrimary
  },
  sublabel: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textTertiary,
    marginTop: 2
  }
});
